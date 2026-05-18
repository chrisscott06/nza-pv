// MapLibre custom 3D layer that draws our buildings using Three.js over the
// satellite map. Walls + roof faces share one material + lighting so the
// building reads as a single continuous surface, and the outline is
// recomputed per frame: edges between a front-facing and a back-facing
// neighbour become the building's silhouette (thick), everything else
// stays as a thin interior crease. That way as the user rotates the
// camera the thick stroke wraps the actual visible outline (up the wall
// corners on one side, across the roof, down the sawtooth on the other,
// along the bottom), not a fixed set of footprint edges.

import { type Building, ensureCCW, lngLatToMeters, polygonCentroidLngLat } from '@nza-pv/shared';
import maplibregl from 'maplibre-gl';
import * as THREE from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';

// Bright off-white architect-card base — nearly pure white with the
// faintest warmth so the building doesn't read as cold industrial.
// The ambient is pushed up and the directional dropped a touch so
// even shaded faces hold a light cream-white rather than dropping
// into mid-grey. Selection swaps to a subtle pale sky blue.
const BUILDING_COLOR = 0xfcfbf6;
const BUILDING_HIGHLIGHT = 0xd9e7f3;
// Outline near-black at a heavier 4 px so the building's silhouette
// reads as a confident line against the satellite imagery. Creases
// drop to a darker grey than before so internal ridges/hips show up
// against the whiter surface without competing with the outline.
const EDGE_OUTLINE = 0x141618;
const EDGE_CREASE = 0x3a3d42;
const OUTLINE_WIDTH_PX = 4;
const CREASE_WIDTH_PX = 1.2;

// Dedup tolerance for matching vertices across faces (in metres, ≈ 0.5 mm).
const POS_QUANT = 2000;

/** A planar polygon face — a wall quad or a roof face. `isWall` flags
 *  faces that participate in the building's vertical envelope: the
 *  footprint extrusion AND any vertical-end-wall roof faces (gable end
 *  triangles, sawtooth bay triangles). Edge classification uses this to
 *  distinguish architectural outline edges (wall-adjacent) from internal
 *  roof creases (ridges, hips, sawtooth valleys) — the latter must stay
 *  thin regardless of where the camera puts them silhouette-wise. */
type FacePart = {
  ring: THREE.Vector3[];
  normal: THREE.Vector3;
  isWall: boolean;
};

/** An undirected edge with the (1 or 2) adjacent face indices that share
 *  it. Boundary edges (1 neighbour) are always silhouette; interior edges
 *  (2 neighbours) are silhouette only when neighbour normals point on
 *  opposite sides of the view direction. */
type EdgeRec = {
  a: THREE.Vector3;
  b: THREE.Vector3;
  faces: number[];
};

/** A per-building bundle of: visible meshes (walls + roof), the edge map
 *  used for silhouette classification, and the two LineSegments2 objects
 *  whose geometry we rewrite each frame. */
type BuildingDraw = {
  parts: FacePart[];
  edges: EdgeRec[];
  silhouette: LineSegments2;
  crease: LineSegments2;
};

export class RoofLayer {
  id = 'roof-3d';
  type = 'custom' as const;
  renderingMode = '3d' as const;

  private renderer?: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.Camera();
  private map?: maplibregl.Map;
  private origin?: maplibregl.MercatorCoordinate;
  private group = new THREE.Group();
  private draws: BuildingDraw[] = [];
  /** Re-used per frame to avoid GC churn. */
  private viewDir = new THREE.Vector3();
  private toEdge = new THREE.Vector3();

  onAdd(map: maplibregl.Map, gl: WebGLRenderingContext | WebGL2RenderingContext): void {
    this.map = map;
    this.renderer = new THREE.WebGLRenderer({
      canvas: map.getCanvas(),
      context: gl as WebGL2RenderingContext,
      antialias: true,
    });
    this.renderer.autoClear = false;
    // Soft shadow mapping so the directional sun drops a shadow onto a
    // hidden ground plane (see `ground` below). Without this the scene
    // looked too "evenly lit"; with this, walls and the ground beside
    // the building pick up subtle shading that grounds the model.
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // High ambient + softer directional sun so even the shaded faces
    // stay bright cream-white rather than dropping into mid-grey.
    // Lights carry the faintest warm tint to match the base; the
    // opposite-side fill keeps the deepest shadow from going flat.
    const ambient = new THREE.AmbientLight(0xfffbf3, 0.7);
    const sun = new THREE.DirectionalLight(0xffffff, 0.55);
    sun.position.set(40, 80, 60);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 400;
    sun.shadow.camera.left = -150;
    sun.shadow.camera.right = 150;
    sun.shadow.camera.top = 150;
    sun.shadow.camera.bottom = -150;
    sun.shadow.bias = -0.0005;
    const fill = new THREE.DirectionalLight(0xfffdf8, 0.18);
    fill.position.set(-50, -40, 30);
    this.scene.add(ambient);
    this.scene.add(sun);
    this.scene.add(fill);
    this.scene.add(this.group);
    // A large invisible ground plane sitting just above z=0 that ONLY
    // catches shadows (ShadowMaterial is otherwise transparent). The
    // satellite imagery from maplibre stays visible through it; only the
    // sun's shadow darkens it where the building blocks light.
    const groundGeom = new THREE.PlaneGeometry(2000, 2000);
    const groundMat = new THREE.ShadowMaterial({ opacity: 0.28 });
    const ground = new THREE.Mesh(groundGeom, groundMat);
    ground.position.set(0, 0, 0.02);
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  onRemove(): void {
    this.clearMeshes();
    this.renderer = undefined;
  }

  setBuildings(buildings: Building[], selectedId: string | null): void {
    this.clearMeshes();
    if (buildings.length === 0) {
      this.origin = undefined;
      return;
    }
    const originLngLat = polygonCentroidLngLat(buildings[0]!.footprint);
    this.origin = maplibregl.MercatorCoordinate.fromLngLat([originLngLat[0], originLngLat[1]], 0);
    for (const b of buildings) {
      const draw = buildBuildingDraw(b, originLngLat, b.id === selectedId);
      if (!draw) continue;
      // Add mesh per face (walls + roof) so triangulation stays planar.
      for (const part of draw.parts) {
        const mesh = makePartMesh(part, b.id === selectedId);
        if (mesh) this.group.add(mesh);
      }
      this.group.add(draw.silhouette);
      this.group.add(draw.crease);
      this.draws.push(draw);
    }
    this.map?.triggerRepaint();
  }

  /** Maplibre v4 calls `render(gl, matrix, options)` with the 4×4 projection
   *  matrix. We compose it with a model transform that places our metre-frame
   *  meshes at the right spot in mercator space. */
  render(
    _gl: WebGLRenderingContext | WebGL2RenderingContext,
    matrix: Float32Array | number[],
  ): void {
    if (!this.origin || !this.renderer || !this.map) return;
    const scale = this.origin.meterInMercatorCoordinateUnits();
    const proj = new THREE.Matrix4().fromArray(matrix as unknown as number[]);
    const model = new THREE.Matrix4()
      .makeTranslation(this.origin.x, this.origin.y, this.origin.z)
      .scale(new THREE.Vector3(scale, -scale, scale));
    this.camera.projectionMatrix = proj.multiply(model);
    // View direction in our scene's metres frame, derived from maplibre's
    // bearing + pitch. Bearing=0 looks north (+Y); pitch=0 looks straight
    // down (-Z); pitch=60 tilts 60° off vertical toward the bearing.
    const bearing = (this.map.getBearing() * Math.PI) / 180;
    const pitch = (this.map.getPitch() * Math.PI) / 180;
    this.viewDir.set(
      Math.sin(bearing) * Math.sin(pitch),
      Math.cos(bearing) * Math.sin(pitch),
      -Math.cos(pitch),
    );
    // Reclassify every edge for every building.
    for (const d of this.draws) this.updateOutlines(d);
    // Update fat-line resolutions (canvas size can change on resize).
    const canvas = this.map.getCanvas();
    for (const d of this.draws) {
      (d.silhouette.material as LineMaterial).resolution.set(canvas.width, canvas.height);
      (d.crease.material as LineMaterial).resolution.set(canvas.width, canvas.height);
    }
    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);
  }

  private updateOutlines(d: BuildingDraw): void {
    const silhouette: number[] = [];
    const crease: number[] = [];
    for (const edge of d.edges) {
      let hasFront = false;
      let hasBack = false;
      let wallCount = 0;
      for (const fIdx of edge.faces) {
        const part = d.parts[fIdx]!;
        if (part.isWall) wallCount++;
        const dotN = part.normal.dot(this.viewDir);
        if (dotN < 0) hasFront = true;
        else if (dotN > 0) hasBack = true;
      }
      // (1) All neighbours back-facing → occluded; hide.
      if (!hasFront) continue;
      // (2) Roof-only edges (ridges, hips, sawtooth valleys, gambrel
      //     breaks) — always thin. Internal roof features are creases,
      //     not outline, even when they happen to straddle the view.
      if (wallCount === 0) {
        push(crease, edge);
        continue;
      }
      // (3) Boundary edge with a wall — the wall-meets-ground line.
      //     Always part of the outline.
      if (edge.faces.length === 1) {
        push(silhouette, edge);
        continue;
      }
      // (4) Any other wall-adjacent edge (wall-to-wall corner OR
      //     wall-to-roof eave): pure silhouette test. The eave between
      //     a front wall and front roof slope is INSIDE the building's
      //     outline and stays thin; the eave that wraps around the
      //     silhouette (where the front roof meets a side wall pointing
      //     away from the camera) gets the heavy stroke. That matches
      //     the user's rule of "only the external outline of what you
      //     can see is thick".
      if (hasFront && hasBack) push(silhouette, edge);
      else push(crease, edge);
    }
    setFatLineGeometry(d.silhouette, silhouette);
    setFatLineGeometry(d.crease, crease);
  }

  private clearMeshes(): void {
    this.group.traverse((obj) => {
      if (
        obj instanceof THREE.Mesh ||
        obj instanceof THREE.LineSegments ||
        obj instanceof LineSegments2
      ) {
        obj.geometry.dispose();
        const m = obj.material;
        if (Array.isArray(m)) m.forEach((mm) => mm.dispose());
        else (m as THREE.Material).dispose();
      }
    });
    this.group.clear();
    this.draws = [];
  }
}

function push(positions: number[], e: EdgeRec): void {
  positions.push(e.a.x, e.a.y, e.a.z, e.b.x, e.b.y, e.b.z);
}

function setFatLineGeometry(line: LineSegments2, positions: number[]): void {
  const old = line.geometry as LineSegmentsGeometry;
  old.dispose();
  const g = new LineSegmentsGeometry();
  if (positions.length > 0) g.setPositions(positions);
  line.geometry = g;
}

// ---------------------------------------------------------------------------
// BuildingModel construction
// ---------------------------------------------------------------------------

function buildBuildingDraw(
  building: Building,
  originLngLat: [number, number],
  _selected: boolean,
): BuildingDraw | null {
  const ringLL = building.footprint.coordinates[0] ?? [];
  if (ringLL.length < 4) return null;
  const footprintM = ensureCCW(
    ringLL.slice(0, -1).map((c) => {
      const lonlat = c as unknown as [number, number];
      return lngLatToMeters([lonlat[0], lonlat[1]], originLngLat);
    }),
  );
  const eave = building.eave_height_m;

  // 1) Collect SLOPED roof faces as FaceParts. We skip `gable_end_wall`
  //    faces (gable end triangles, sawtooth / M-roof per-bay infills)
  //    entirely: the profile-following wall below covers exactly the
  //    same area via its zigzag top, so including them too would
  //    introduce a duplicate "base" edge running straight across the
  //    eave that the wall doesn't share (it goes via the peak), and
  //    that edge ends up as a spurious thick line cutting INSIDE the
  //    building's outline.
  const roofParts: FacePart[] = [];
  for (const face of building.faces) {
    if (face.role === 'gable_end_wall') continue;
    const ring = face.geometry.coordinates[0] ?? [];
    if (ring.length < 4) continue;
    const verts: THREE.Vector3[] = [];
    for (let i = 0; i < ring.length - 1; i++) {
      const c = ring[i] as unknown as [number, number, number];
      const [x, y] = lngLatToMeters([c[0], c[1]], originLngLat);
      verts.push(new THREE.Vector3(x, y, c[2] ?? 0));
    }
    const normal = polygonNormal(verts);
    if (!normal) continue;
    roofParts.push({ ring: verts, normal, isWall: false });
  }

  // 2) Build wall faces whose TOP edges follow the actual roof profile
  //    along each footprint edge. For a sawtooth that means a zigzag top;
  //    for a gable it's flat at eave height; for either, the wall's top
  //    edges precisely match roof eave / triangle-infill edges so the
  //    silhouette pass can detect adjacency.
  const wallParts: FacePart[] = [];
  if (eave > 0) {
    for (let i = 0; i < footprintM.length; i++) {
      const A = footprintM[i]!;
      const B = footprintM[(i + 1) % footprintM.length]!;
      const wall = buildWallFollowingProfile(A, B, roofParts, eave);
      if (wall) wallParts.push(wall);
    }
  }

  const parts = [...wallParts, ...roofParts];

  // 3) Walk every face boundary edge, dedup by quantised endpoint
  //    positions, and accumulate the adjacent face indices.
  const edgeMap = new Map<string, EdgeRec>();
  for (let i = 0; i < parts.length; i++) {
    const ring = parts[i]!.ring;
    for (let j = 0; j < ring.length; j++) {
      const a = ring[j]!;
      const b = ring[(j + 1) % ring.length]!;
      const key = edgeKey(a, b);
      let rec = edgeMap.get(key);
      if (!rec) {
        rec = { a: a.clone(), b: b.clone(), faces: [] };
        edgeMap.set(key, rec);
      }
      rec.faces.push(i);
    }
  }
  const edges = Array.from(edgeMap.values());

  // 4) Pre-allocate the silhouette / crease line objects; geometry is
  //    rewritten each frame from updateOutlines().
  const silhouette = makeFatLine([], EDGE_OUTLINE, OUTLINE_WIDTH_PX);
  const crease = makeFatLine([], EDGE_CREASE, CREASE_WIDTH_PX);

  return { parts, edges, silhouette, crease };
}

/** Build a wall mesh face that goes from A_ground → B_ground up the corner
 *  at B, then back along the actual roof profile (collected from roof-face
 *  vertices that land on segment AB), down the corner at A. The resulting
 *  polygon's edges line up exactly with the roof's eave / infill edges
 *  along this footprint side, so the silhouette pass can find their
 *  adjacency in the edge dedup map. */
function buildWallFollowingProfile(
  A: [number, number],
  B: [number, number],
  roofParts: FacePart[],
  defaultEave: number,
): FacePart | null {
  const dx = B[0] - A[0];
  const dy = B[1] - A[1];
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-6) return null;

  // Collect roof vertices that sit on this segment AB (projected within
  // the [0, 1] parameter range AND close to the line in the perpendicular
  // direction). Each contributes a (t, z, x, y) to the profile.
  const TOL_PERP = 0.05;
  type ProfilePt = { t: number; z: number; x: number; y: number };
  const profile: ProfilePt[] = [];
  const seen = new Set<string>();
  for (const part of roofParts) {
    for (const v of part.ring) {
      const t = ((v.x - A[0]) * dx + (v.y - A[1]) * dy) / len2;
      if (t < -1e-4 || t > 1 + 1e-4) continue;
      const projX = A[0] + t * dx;
      const projY = A[1] + t * dy;
      const perpDist = Math.hypot(v.x - projX, v.y - projY);
      if (perpDist > TOL_PERP) continue;
      const key = `${Math.round(t * 1e6)},${Math.round(v.z * POS_QUANT)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      profile.push({ t: Math.max(0, Math.min(1, t)), z: v.z, x: v.x, y: v.y });
    }
  }
  // Always anchor the endpoints to the eave so a gable / hip building with
  // no roof vertices ON the front edge still gets a clean rectangular wall.
  if (profile.length === 0 || profile[0]!.t > 1e-3) {
    profile.unshift({ t: 0, z: defaultEave, x: A[0], y: A[1] });
  }
  if (profile[profile.length - 1]!.t < 1 - 1e-3) {
    profile.push({ t: 1, z: defaultEave, x: B[0], y: B[1] });
  }
  profile.sort((a, b) => a.t - b.t);

  // Skip profile points whose z is at or below 0 — they'd produce a
  // zero-height wall on that side.
  const maxZ = profile.reduce((acc, p) => Math.max(acc, p.z), 0);
  if (maxZ <= 1e-3) return null;

  // Build the wall ring CCW from outside: A_ground → B_ground → up the
  // right corner along the profile points (reverse t order) → down the
  // left corner.
  const ring: THREE.Vector3[] = [];
  ring.push(new THREE.Vector3(A[0], A[1], 0));
  ring.push(new THREE.Vector3(B[0], B[1], 0));
  for (let i = profile.length - 1; i >= 0; i--) {
    const p = profile[i]!;
    ring.push(new THREE.Vector3(p.x, p.y, p.z));
  }
  // Normal: perpendicular to AB in world XY, pointing OUTWARD. For CCW
  // footprint, outward is the right-hand-side of AB direction.
  const len = Math.sqrt(len2);
  const normal = new THREE.Vector3(dy / len, -dx / len, 0);
  return { ring, normal, isWall: true };
}

function makePartMesh(part: FacePart, selected: boolean): THREE.Mesh | null {
  const geom = triangulatePlanarPolygon(part.ring);
  if (!geom) return null;
  const mat = new THREE.MeshLambertMaterial({
    color: selected ? BUILDING_HIGHLIGHT : BUILDING_COLOR,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function makeFatLine(positions: number[], color: number, widthPx: number): LineSegments2 {
  const g = new LineSegmentsGeometry();
  if (positions.length > 0) g.setPositions(positions);
  const m = new LineMaterial({
    color,
    linewidth: widthPx,
    resolution: new THREE.Vector2(1, 1),
    worldUnits: false,
  });
  return new LineSegments2(g, m);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Quantised positional key for dedup. Endpoints are sorted so an edge
 *  added in either direction maps to the same key. */
function edgeKey(a: THREE.Vector3, b: THREE.Vector3): string {
  const ka = `${Math.round(a.x * POS_QUANT)},${Math.round(a.y * POS_QUANT)},${Math.round(a.z * POS_QUANT)}`;
  const kb = `${Math.round(b.x * POS_QUANT)},${Math.round(b.y * POS_QUANT)},${Math.round(b.z * POS_QUANT)}`;
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
}

/** Unit normal of a planar polygon via Newell's method. Returns null if
 *  the polygon is degenerate. */
function polygonNormal(verts: THREE.Vector3[]): THREE.Vector3 | null {
  const n = new THREE.Vector3();
  for (let i = 0; i < verts.length; i++) {
    const a = verts[i]!;
    const b = verts[(i + 1) % verts.length]!;
    n.x += (a.y - b.y) * (a.z + b.z);
    n.y += (a.z - b.z) * (a.x + b.x);
    n.z += (a.x - b.x) * (a.y + b.y);
  }
  if (n.lengthSq() < 1e-12) return null;
  return n.normalize();
}

function triangulatePlanarPolygon(verts: THREE.Vector3[]): THREE.BufferGeometry | null {
  if (verts.length < 3) return null;
  const n = polygonNormal(verts);
  if (!n) return null;
  const u = new THREE.Vector3();
  const v = new THREE.Vector3();
  if (Math.abs(n.x) <= Math.abs(n.y) && Math.abs(n.x) <= Math.abs(n.z)) u.set(1, 0, 0);
  else if (Math.abs(n.y) <= Math.abs(n.z)) u.set(0, 1, 0);
  else u.set(0, 0, 1);
  u.crossVectors(u, n).normalize();
  v.crossVectors(n, u).normalize();
  const flat: number[] = [];
  for (const p of verts) flat.push(p.dot(u), p.dot(v));
  const indices = earcut(flat);
  if (indices.length === 0) return null;
  const positions: number[] = [];
  for (const idx of indices) {
    const p = verts[idx]!;
    positions.push(p.x, p.y, p.z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.computeVertexNormals();
  return g;
}

function earcut(coords: number[]): number[] {
  const n = coords.length / 2;
  const verts: number[] = [];
  for (let i = 0; i < n; i++) verts.push(i);
  const out: number[] = [];
  if (n < 3) return out;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const a = i;
    const b = (i + 1) % n;
    area += coords[a * 2]! * coords[b * 2 + 1]! - coords[b * 2]! * coords[a * 2 + 1]!;
  }
  if (area < 0) verts.reverse();
  let guard = 0;
  while (verts.length > 3 && guard++ < 5000) {
    let ear = -1;
    for (let i = 0; i < verts.length; i++) {
      const i0 = verts[(i - 1 + verts.length) % verts.length]!;
      const i1 = verts[i]!;
      const i2 = verts[(i + 1) % verts.length]!;
      const ax = coords[i0 * 2]!;
      const ay = coords[i0 * 2 + 1]!;
      const bx = coords[i1 * 2]!;
      const by = coords[i1 * 2 + 1]!;
      const cx = coords[i2 * 2]!;
      const cy = coords[i2 * 2 + 1]!;
      const cross = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      if (cross <= 0) continue;
      let inside = false;
      for (let j = 0; j < verts.length; j++) {
        const id = verts[j]!;
        if (id === i0 || id === i1 || id === i2) continue;
        const px = coords[id * 2]!;
        const py = coords[id * 2 + 1]!;
        if (pointInTri(px, py, ax, ay, bx, by, cx, cy)) {
          inside = true;
          break;
        }
      }
      if (!inside) {
        ear = i;
        out.push(i0, i1, i2);
        verts.splice(i, 1);
        break;
      }
    }
    if (ear === -1) break;
  }
  if (verts.length === 3) out.push(verts[0]!, verts[1]!, verts[2]!);
  return out;
}

function pointInTri(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
): boolean {
  const v0x = cx - ax;
  const v0y = cy - ay;
  const v1x = bx - ax;
  const v1y = by - ay;
  const v2x = px - ax;
  const v2y = py - ay;
  const dot00 = v0x * v0x + v0y * v0y;
  const dot01 = v0x * v1x + v0y * v1y;
  const dot02 = v0x * v2x + v0y * v2y;
  const dot11 = v1x * v1x + v1y * v1y;
  const dot12 = v1x * v2x + v1y * v2y;
  const inv = 1 / (dot00 * dot11 - dot01 * dot01);
  const u = (dot11 * dot02 - dot01 * dot12) * inv;
  const v = (dot00 * dot12 - dot01 * dot02) * inv;
  return u >= 0 && v >= 0 && u + v < 1;
}
