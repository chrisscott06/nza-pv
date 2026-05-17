// 3D scene — building masses + roof faces. Cameras orbit around the project
// centroid. Picking and per-face interactivity arrives with Day 7.

import {
  type Building,
  type RoofFace,
  lngLatToMeters,
  polygonCentroidLngLat,
  polygonRingToMeters,
} from '@nza-pv/shared';
import { OrbitControls } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useShallow } from 'zustand/shallow';
import { selectActiveBuilding, selectActiveFace, useProject } from '../store/projectStore.js';

const WALL_COLOR = 0xf0ebe5;
const ROOF_COLOR = 0x3a3a3a;
const ROOF_HOT = 0x7ec98a;
const ROOF_PV_OFF = 0x6a6256;

export function SceneView(): JSX.Element {
  const project = useProject((s) => s.project);
  const buildings = project?.buildings ?? [];
  const select = useProject((s) => s.select);
  const activeBuilding = useProject(selectActiveBuilding);
  // `useShallow` — see InspectorPanel for the matching note. Without it,
  // clicking a roof face triggers a maximum-update-depth render loop.
  const activeFaceSel = useProject(useShallow(selectActiveFace));

  const anchor = useMemo<[number, number]>(() => {
    if (!buildings.length) return [-2.3013, 51.9213];
    return polygonCentroidLngLat(buildings[0]!.footprint);
  }, [buildings]);

  return (
    <div className="scene-root">
      <Canvas shadows camera={{ position: [50, 50, 70], fov: 45, near: 0.1, far: 5000 }}>
        <color attach="background" args={['#1b242b']} />
        <fog attach="fog" args={['#1b242b', 200, 600]} />
        <hemisphereLight args={[0xdbe7f0, 0x1f261c, 0.55]} />
        <directionalLight
          position={[35, 80, 35]}
          intensity={1.05}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-left={-150}
          shadow-camera-right={150}
          shadow-camera-top={150}
          shadow-camera-bottom={-150}
          shadow-camera-near={1}
          shadow-camera-far={400}
        />
        <Ground />
        {buildings.map((b) => (
          <BuildingMesh
            key={b.id}
            building={b}
            anchor={anchor}
            isSelected={activeBuilding?.id === b.id}
            selectedFaceId={
              activeFaceSel && activeFaceSel.buildingId === b.id ? activeFaceSel.face.id : null
            }
            onPickBuilding={() => select({ kind: 'building', buildingId: b.id })}
            onPickFace={(faceId) => select({ kind: 'face', buildingId: b.id, faceId })}
          />
        ))}
        <CameraFitter buildings={buildings} anchor={anchor} />
        <OrbitControls
          makeDefault
          target={[0, 5, 0]}
          maxPolarAngle={Math.PI / 2 - 0.05}
          enableDamping
          dampingFactor={0.08}
        />
      </Canvas>
      {buildings.length === 0 && (
        <div className="view-only-3d-msg">
          Draw a building in 2D first — it'll appear here when you switch views.
        </div>
      )}
    </div>
  );
}

function Ground(): JSX.Element {
  return (
    <mesh receiveShadow position={[0, -0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[2000, 2000]} />
      <meshStandardMaterial color={0x2a3239} roughness={1} />
    </mesh>
  );
}

function CameraFitter({
  buildings,
  anchor,
}: { buildings: Building[]; anchor: [number, number] }): null {
  const camera = useThree((s) => s.camera);
  const did = useRef(false);
  useEffect(() => {
    if (did.current || buildings.length === 0) return;
    did.current = true;
    // Compute bounding box of all buildings and zoom-to-fit roughly.
    let minX = Number.POSITIVE_INFINITY,
      maxX = Number.NEGATIVE_INFINITY,
      minZ = Number.POSITIVE_INFINITY,
      maxZ = Number.NEGATIVE_INFINITY;
    for (const b of buildings) {
      const ring = polygonRingToMeters(b.footprint, anchor);
      const centroid = lngLatToMeters(polygonCentroidLngLat(b.footprint), anchor);
      for (const p of ring) {
        const x = p[0] - centroid[0];
        const y = p[1] - centroid[1];
        // We place buildings at (centroid.x, 0, -centroid.y).
        const wx = x + centroid[0];
        const wz = -(y + centroid[1]);
        if (wx < minX) minX = wx;
        if (wx > maxX) maxX = wx;
        if (wz < minZ) minZ = wz;
        if (wz > maxZ) maxZ = wz;
      }
    }
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    const span = Math.max(maxX - minX, maxZ - minZ, 30);
    const dist = Math.max(40, span * 1.4);
    camera.position.set(cx + dist * 0.7, dist * 0.7, cz + dist * 0.7);
    camera.lookAt(cx, 0, cz);
    camera.updateProjectionMatrix();
  }, [buildings, anchor, camera]);
  return null;
}

function BuildingMesh({
  building,
  anchor,
  isSelected,
  selectedFaceId,
  onPickBuilding,
  onPickFace,
}: {
  building: Building;
  anchor: [number, number];
  isSelected: boolean;
  selectedFaceId: string | null;
  onPickBuilding: () => void;
  onPickFace: (faceId: string) => void;
}): JSX.Element {
  // Deps are restricted to *primitives that change geometry*. Immer keeps
  // unchanged subtrees identity-stable, so `building.footprint` stays the same
  // reference when only `building.faces` is touched — that prevents an
  // expensive wallGeom rebuild on every selection change.
  const footprint = building.footprint;
  const eave = building.eave_height_m;

  const centroid = useMemo(
    () => lngLatToMeters(polygonCentroidLngLat(footprint), anchor),
    [footprint, anchor],
  );
  const ring = useMemo(() => {
    const r = polygonRingToMeters(footprint, anchor);
    return r.map((p) => [p[0] - centroid[0], p[1] - centroid[1]] as [number, number]);
  }, [footprint, anchor, centroid]);

  const wallGeom = useDisposableGeometry(() => {
    const shape = new THREE.Shape();
    ring.forEach((p, i) => {
      if (i === 0) shape.moveTo(p[0], p[1]);
      else shape.lineTo(p[0], p[1]);
    });
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: eave, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    g.computeVertexNormals();
    return g;
  }, [ring, eave]);

  if (!wallGeom) return <></>;

  return (
    <group
      position={[centroid[0], 0, -centroid[1]]}
      onClick={(e) => {
        e.stopPropagation();
        onPickBuilding();
      }}
    >
      <mesh castShadow receiveShadow geometry={wallGeom}>
        <meshStandardMaterial color={WALL_COLOR} roughness={0.88} />
      </mesh>
      {building.faces.map((face) => (
        <FaceMesh
          key={face.id}
          face={face}
          anchor={anchor}
          centroid={centroid}
          highlight={selectedFaceId === face.id}
          dim={!!selectedFaceId && selectedFaceId !== face.id}
          buildingSelected={isSelected}
          onClick={() => onPickFace(face.id)}
        />
      ))}
    </group>
  );
}

/** Builds a BufferGeometry that disposes itself when deps change or the
 *  component unmounts. Returning null when the build throws keeps the scene
 *  alive instead of unmounting the whole Canvas on a single bad face. */
function useDisposableGeometry(
  build: () => THREE.BufferGeometry | null,
  deps: React.DependencyList,
): THREE.BufferGeometry | null {
  const ref = useRef<THREE.BufferGeometry | null>(null);
  const geom = useMemo(() => {
    if (ref.current) ref.current.dispose();
    try {
      const g = build();
      ref.current = g;
      return g;
    } catch (err) {
      console.error('[SceneView] geometry build failed', err);
      ref.current = null;
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(
    () => () => {
      if (ref.current) ref.current.dispose();
      ref.current = null;
    },
    [],
  );
  return geom;
}

function FaceMesh({
  face,
  anchor,
  centroid,
  highlight,
  dim,
  buildingSelected,
  onClick,
}: {
  face: RoofFace;
  anchor: [number, number];
  centroid: [number, number];
  highlight: boolean;
  dim: boolean;
  buildingSelected: boolean;
  onClick: () => void;
}): JSX.Element | null {
  // Depend on `face.geometry` (a stable subtree under immer) rather than the
  // whole `face` so eligibility toggles don't rebuild the GPU mesh.
  const faceGeom = face.geometry;
  const geom = useDisposableGeometry(() => {
    const ring = faceGeom.coordinates[0] ?? [];
    if (ring.length < 3) return null;
    const verts: THREE.Vector3[] = [];
    for (let i = 0; i < ring.length - 1; i++) {
      const c = ring[i] as unknown as [number, number, number];
      const xy = lngLatToMeters([c[0], c[1]], anchor);
      verts.push(new THREE.Vector3(xy[0] - centroid[0], c[2] ?? 0, -(xy[1] - centroid[1])));
    }
    return buildPolygonGeometry(verts);
  }, [faceGeom, anchor, centroid]);
  if (!geom) return null;
  const baseColor = face.role === 'sawtooth_glazing' ? 0xbfd6df : ROOF_COLOR;
  const color = highlight
    ? ROOF_HOT
    : !face.is_pv_eligible &&
        (face.role === 'main' || face.role.startsWith('mansard') || face.role.startsWith('gambrel'))
      ? ROOF_PV_OFF
      : baseColor;
  const opacity = dim ? 0.7 : 1;
  return (
    <mesh
      castShadow
      receiveShadow
      geometry={geom}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <meshStandardMaterial
        color={color}
        roughness={0.78}
        metalness={0.02}
        side={THREE.DoubleSide}
        transparent={opacity < 1}
        opacity={opacity}
        emissive={
          highlight && buildingSelected ? new THREE.Color(0x113322) : new THREE.Color(0x000000)
        }
      />
    </mesh>
  );
}

/** Build a planar triangulated BufferGeometry from a 3D polygon by projecting
 *  to the plane's normal and using earcut. Returns null for degenerate inputs
 *  so the caller can skip them instead of pushing NaN into a buffer (which
 *  crashes WebGL on the next raycast / pick). */
function buildPolygonGeometry(verts: THREE.Vector3[]): THREE.BufferGeometry | null {
  if (verts.length < 3) return null;
  // De-duplicate consecutive vertices that share the same XYZ — a degenerate
  // ring (e.g. a wall whose corner has zero height) would otherwise yield
  // zero-area triangles and NaN vertex normals.
  const clean: THREE.Vector3[] = [];
  const EPS = 1e-6;
  for (const v of verts) {
    if (!Number.isFinite(v.x) || !Number.isFinite(v.y) || !Number.isFinite(v.z)) continue;
    const prev = clean[clean.length - 1];
    if (prev && Math.abs(prev.x - v.x) < EPS && Math.abs(prev.y - v.y) < EPS && Math.abs(prev.z - v.z) < EPS) continue;
    clean.push(v);
  }
  if (clean.length >= 2) {
    const first = clean[0]!;
    const last = clean[clean.length - 1]!;
    if (Math.abs(first.x - last.x) < EPS && Math.abs(first.y - last.y) < EPS && Math.abs(first.z - last.z) < EPS) {
      clean.pop();
    }
  }
  if (clean.length < 3) return null;
  const g = new THREE.BufferGeometry();
  const positions: number[] = [];
  // Compute plane normal via Newell's method.
  const n = new THREE.Vector3();
  for (let i = 0; i < clean.length; i++) {
    const a = clean[i]!;
    const b = clean[(i + 1) % clean.length]!;
    n.x += (a.y - b.y) * (a.z + b.z);
    n.y += (a.z - b.z) * (a.x + b.x);
    n.z += (a.x - b.x) * (a.y + b.y);
  }
  if (n.lengthSq() < EPS) return null; // truly degenerate / collinear
  n.normalize();
  // Replace `verts` with the cleaned ring for the rest of the function.
  verts = clean;
  // Build a basis on the plane.
  const u = new THREE.Vector3();
  const v = new THREE.Vector3();
  if (Math.abs(n.x) <= Math.abs(n.y) && Math.abs(n.x) <= Math.abs(n.z)) u.set(1, 0, 0);
  else if (Math.abs(n.y) <= Math.abs(n.z)) u.set(0, 1, 0);
  else u.set(0, 0, 1);
  u.crossVectors(u, n).normalize();
  v.crossVectors(n, u).normalize();
  const flat: number[] = [];
  for (const p of verts) {
    flat.push(p.dot(u), p.dot(v));
  }
  const indices = earcut(flat);
  for (const idx of indices) {
    const p = verts[idx]!;
    positions.push(p.x, p.y, p.z);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.computeVertexNormals();
  return g;
}

// Tiny earcut implementation (planar) — adequate for convex/non-self-
// intersecting roof faces, which is all our generators produce.
function earcut(coords: number[]): number[] {
  const n = coords.length / 2;
  const verts: number[] = [];
  for (let i = 0; i < n; i++) verts.push(i);
  const out: number[] = [];
  if (n < 3) return out;
  // Ensure CCW.
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
      const ax = coords[i0 * 2]!,
        ay = coords[i0 * 2 + 1]!;
      const bx = coords[i1 * 2]!,
        by = coords[i1 * 2 + 1]!;
      const cx = coords[i2 * 2]!,
        cy = coords[i2 * 2 + 1]!;
      const cross = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      if (cross <= 0) continue;
      let inside = false;
      for (let j = 0; j < verts.length; j++) {
        const id = verts[j]!;
        if (id === i0 || id === i1 || id === i2) continue;
        const px = coords[id * 2]!,
          py = coords[id * 2 + 1]!;
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
  const v0x = cx - ax,
    v0y = cy - ay;
  const v1x = bx - ax,
    v1y = by - ay;
  const v2x = px - ax,
    v2y = py - ay;
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
