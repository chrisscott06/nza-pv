// MapLibre custom 3D layer that draws our buildings using Three.js over the
// satellite map. Walls AND roof faces both live here now, sharing the same
// material + lighting so the building reads as a single continuous surface
// rather than a coloured roof sitting on a flat cream base. Outlines use
// the fat-line shader from three/examples (LineSegments2) so we get a
// proper thick stroke instead of WebGL's clamped 1px `gl.lineWidth`.

import {
  type Building,
  ensureCCW,
  lngLatToMeters,
  polygonCentroidLngLat,
  type RoofFace,
} from '@nza-pv/shared';
import maplibregl from 'maplibre-gl';
import * as THREE from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';

// One cream for the whole building — walls and roof faces. Variation comes
// from the directional light hitting different face angles, the same way
// it would in a real architect's massing model. The warm-cream highlight
// only swaps in when the user has the building selected.
const BUILDING_COLOR = 0xf0ebe5;
const BUILDING_HIGHLIGHT = 0xfff1cf;
// Stroke colours and pixel widths for the fat-line outline pass. The
// silhouette (wall corners + eaves) gets the heavier stroke so the
// building reads as a single boxy shape; ridges / hips / gambrel breaks
// get the lighter crease stroke so they don't fight the silhouette.
const EDGE_OUTLINE = 0x141618;
const EDGE_CREASE = 0x3a3d42;
const OUTLINE_WIDTH_PX = 3;
const CREASE_WIDTH_PX = 1.5;

// We don't `implements maplibregl.CustomLayerInterface` because the maplibre
// type for `render` references gl-matrix's `mat4` (a Float32Array), and the
// matching signature trips a structural check we don't gain anything from.
// The shape we expose at runtime is exactly what maplibre's custom-layer
// dispatcher expects.
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
  /** LineMaterial computes fat-line width in screen space, so it needs the
   *  current canvas pixel size every frame. We collect every material we
   *  create here and refresh `resolution` from `render()`. */
  private lineMaterials: LineMaterial[] = [];

  onAdd(map: maplibregl.Map, gl: WebGLRenderingContext | WebGL2RenderingContext): void {
    this.map = map;
    this.renderer = new THREE.WebGLRenderer({
      canvas: map.getCanvas(),
      context: gl as WebGL2RenderingContext,
      antialias: true,
    });
    this.renderer.autoClear = false;
    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    const sun = new THREE.DirectionalLight(0xffffff, 0.7);
    sun.position.set(40, 80, 60);
    this.scene.add(ambient);
    this.scene.add(sun);
    this.scene.add(this.group);
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
    // Use first building's footprint centroid as a stable origin for the
    // metres frame the meshes live in. The transform in `render()` maps that
    // origin to its mercator location every frame.
    const originLngLat = polygonCentroidLngLat(buildings[0]!.footprint);
    this.origin = maplibregl.MercatorCoordinate.fromLngLat([originLngLat[0], originLngLat[1]], 0);
    for (const b of buildings) {
      const sel = b.id === selectedId;
      // Walls: a single mesh per building, lit by the same scene lights as
      // the roof — replaces maplibre's flat fill-extrusion so the whole
      // building reads as one shaded surface.
      const walls = buildWallMesh(b, originLngLat, sel);
      if (walls) this.group.add(walls);
      // Roof faces.
      for (const face of b.faces) {
        const mesh = buildFaceMesh(face, originLngLat, sel);
        if (mesh) this.group.add(mesh);
      }
      // Outline: vertical wall corners + eave perimeter (where wall meets
      // roof). This is the building's "boxy" silhouette regardless of roof
      // shape; drawn with the heavier stroke.
      const outline = buildSilhouetteLines(b, originLngLat);
      if (outline) {
        this.group.add(outline);
        this.lineMaterials.push(outline.material as LineMaterial);
      }
      // Creases: roof-face edges above the eave (ridges, hips, gambrel
      // breaks). Lighter stroke so they don't compete with the outline.
      const creases = buildRoofCreaseLines(b, originLngLat);
      if (creases) {
        this.group.add(creases);
        this.lineMaterials.push(creases.material as LineMaterial);
      }
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
    if (!this.origin || !this.renderer) return;
    const scale = this.origin.meterInMercatorCoordinateUnits();
    const proj = new THREE.Matrix4().fromArray(matrix as unknown as number[]);
    // Our meshes use vertex.x = east-metres, vertex.y = north-metres,
    // vertex.z = up-metres. Mercator Y grows southward, so we flip Y when
    // building the transform.
    const model = new THREE.Matrix4()
      .makeTranslation(this.origin.x, this.origin.y, this.origin.z)
      .scale(new THREE.Vector3(scale, -scale, scale));
    this.camera.projectionMatrix = proj.multiply(model);
    // Fat-line widths are computed in screen space, so the material needs
    // the live canvas pixel size each frame (it can change on map resize).
    const canvas = this.map?.getCanvas();
    if (canvas) {
      for (const mat of this.lineMaterials) {
        mat.resolution.set(canvas.width, canvas.height);
      }
    }
    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);
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
    this.lineMaterials = [];
  }
}

function buildFaceMesh(
  face: RoofFace,
  originLngLat: [number, number],
  selected: boolean,
): THREE.Mesh | null {
  const ring = face.geometry.coordinates[0] ?? [];
  if (ring.length < 4) return null;
  const verts: THREE.Vector3[] = [];
  // Skip the closing duplicate vertex at the end of the ring.
  for (let i = 0; i < ring.length - 1; i++) {
    const c = ring[i] as unknown as [number, number, number];
    const xy = lngLatToMeters([c[0], c[1]], originLngLat);
    verts.push(new THREE.Vector3(xy[0], xy[1], c[2] ?? 0));
  }
  const geom = triangulatePlanarPolygon(verts);
  if (!geom) return null;
  const mat = new THREE.MeshLambertMaterial({
    color: selected ? BUILDING_HIGHLIGHT : BUILDING_COLOR,
    side: THREE.DoubleSide,
  });
  return new THREE.Mesh(geom, mat);
}

/** Extrude the footprint into a single wall mesh, sharing the same
 *  material + lighting as the roof. Replaces maplibre's flat fill-
 *  extrusion so the building reads as one continuous shaded surface. */
function buildWallMesh(
  building: Building,
  originLngLat: [number, number],
  selected: boolean,
): THREE.Mesh | null {
  const eave = building.eave_height_m;
  if (eave <= 0) return null;
  const ringLL = building.footprint.coordinates[0] ?? [];
  if (ringLL.length < 4) return null;
  // ensureCCW so that each wall quad ends up with its outward normal
  // (computed via cross product of edge1 × +Z) pointing AWAY from the
  // building interior — otherwise Lambert lighting would flip and the
  // walls would render as if lit from inside.
  const ringM = ensureCCW(
    ringLL.slice(0, -1).map((c) => {
      const lonlat = c as unknown as [number, number];
      return lngLatToMeters([lonlat[0], lonlat[1]], originLngLat);
    }),
  );
  const positions: number[] = [];
  for (let i = 0; i < ringM.length; i++) {
    const a = ringM[i]!;
    const b = ringM[(i + 1) % ringM.length]!;
    // Two triangles per wall quad, wound so the outward normal is
    // perpendicular to the wall in world XY (no vertical tilt).
    positions.push(
      a[0],
      a[1],
      0, // A_ground
      b[0],
      b[1],
      0, // B_ground
      b[0],
      b[1],
      eave, // B_eave
      a[0],
      a[1],
      0, // A_ground
      b[0],
      b[1],
      eave, // B_eave
      a[0],
      a[1],
      eave, // A_eave
    );
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({
    color: selected ? BUILDING_HIGHLIGHT : BUILDING_COLOR,
    side: THREE.DoubleSide,
  });
  return new THREE.Mesh(g, mat);
}

/** The building's silhouette skeleton: vertical edges at every footprint
 *  corner from ground to eave, plus the eave perimeter itself (footprint
 *  polygon traced at eave height). These together box the building in,
 *  regardless of what shape the roof takes — the user's "thick outline
 *  across the whole external". Returns a single fat-line LineSegments2 so
 *  width survives WebGL's `gl.lineWidth` clamp. */
function buildSilhouetteLines(
  building: Building,
  originLngLat: [number, number],
): LineSegments2 | null {
  const ringLL = building.footprint.coordinates[0] ?? [];
  if (ringLL.length < 4) return null;
  const eave = building.eave_height_m;
  const ringM: Array<[number, number]> = ringLL.slice(0, -1).map((c) => {
    const lonlat = c as unknown as [number, number];
    return lngLatToMeters([lonlat[0], lonlat[1]], originLngLat);
  });
  const positions: number[] = [];
  for (let i = 0; i < ringM.length; i++) {
    const a = ringM[i]!;
    const b = ringM[(i + 1) % ringM.length]!;
    // Vertical wall-corner segment at A.
    positions.push(a[0], a[1], 0, a[0], a[1], eave);
    // Horizontal eave segment from A to B at eave height.
    positions.push(a[0], a[1], eave, b[0], b[1], eave);
  }
  return positions.length > 0 ? makeFatLine(positions, EDGE_OUTLINE, OUTLINE_WIDTH_PX) : null;
}

/** Ridges, hips, valleys, gambrel breaks — every roof-face edge whose
 *  endpoints aren't both sitting on the eave plane. Lighter colour and
 *  thinner stroke than the silhouette so it sits behind the building's
 *  outline visually. */
function buildRoofCreaseLines(
  building: Building,
  originLngLat: [number, number],
): LineSegments2 | null {
  const EAVE_TOL = 0.05;
  const eave = building.eave_height_m;
  // De-duplicate edges shared between adjacent faces so each ridge / hip
  // only renders once (it'd otherwise count twice — once per face).
  const seen = new Set<string>();
  const positions: number[] = [];
  for (const face of building.faces) {
    const ring = face.geometry.coordinates[0] ?? [];
    if (ring.length < 4) continue;
    const verts: Array<[number, number, number]> = [];
    for (let i = 0; i < ring.length - 1; i++) {
      const c = ring[i] as unknown as [number, number, number];
      const [x, y] = lngLatToMeters([c[0], c[1]], originLngLat);
      verts.push([x, y, c[2] ?? 0]);
    }
    for (let i = 0; i < verts.length; i++) {
      const a = verts[i]!;
      const b = verts[(i + 1) % verts.length]!;
      // Skip edges that lie on the eave plane — those belong to the
      // silhouette pass, not the crease pass.
      if (Math.abs(a[2] - eave) < EAVE_TOL && Math.abs(b[2] - eave) < EAVE_TOL) continue;
      const key = edgeKey(a, b);
      if (seen.has(key)) continue;
      seen.add(key);
      positions.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    }
  }
  return positions.length > 0 ? makeFatLine(positions, EDGE_CREASE, CREASE_WIDTH_PX) : null;
}

function edgeKey(a: [number, number, number], b: [number, number, number]): string {
  // Round to mm so floating-point drift doesn't break the dedup.
  const q = (n: number): number => Math.round(n * 1000);
  const ka = `${q(a[0])},${q(a[1])},${q(a[2])}`;
  const kb = `${q(b[0])},${q(b[1])},${q(b[2])}`;
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
}

function makeFatLine(positions: number[], color: number, widthPx: number): LineSegments2 {
  const g = new LineSegmentsGeometry();
  g.setPositions(positions);
  const m = new LineMaterial({
    color,
    linewidth: widthPx,
    // Resolution gets updated each frame from RoofLayer.render(); seed
    // with something non-zero so the first frame doesn't draw zero-width
    // lines.
    resolution: new THREE.Vector2(1, 1),
    worldUnits: false,
  });
  return new LineSegments2(g, m);
}

/** Earcut-based triangulator for a planar 3D polygon. Same shape as
 *  SceneView's helper but kept local so this layer has no React dependency. */
function triangulatePlanarPolygon(verts: THREE.Vector3[]): THREE.BufferGeometry | null {
  if (verts.length < 3) return null;
  const n = new THREE.Vector3();
  for (let i = 0; i < verts.length; i++) {
    const a = verts[i]!;
    const b = verts[(i + 1) % verts.length]!;
    n.x += (a.y - b.y) * (a.z + b.z);
    n.y += (a.z - b.z) * (a.x + b.x);
    n.z += (a.x - b.x) * (a.y + b.y);
  }
  if (n.lengthSq() < 1e-12) return null;
  n.normalize();
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
