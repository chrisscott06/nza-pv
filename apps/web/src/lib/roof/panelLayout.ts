// Simple grid-based PV panel layout per roof face. Packs landscape /
// portrait panels into the face polygon in face-local UV coords with a
// fixed eave margin, then back-projects each panel's 4 corners to world
// 3D for rendering. Pre-feasibility quality: no obstacle avoidance, no
// proper polygon offset — just inset bounding box + corner-in-polygon
// tests. Phase 3+ will do real obstacle-aware placement.

import type { RoofFace } from '@nza-pv/shared';
import * as THREE from 'three';

/** Typical residential PV panel aspect ratio (1.7m × 1.15m landscape). */
const PANEL_ASPECT = 1.7 / 1.15;
/** Setback from each face edge in metres — keeps panels off the eave
 *  and ridge so the layout reads as plausible architecturally. */
const DEFAULT_MARGIN_M = 0.4;
/** Gap between adjacent panels, metres. */
const PANEL_GAP_M = 0.05;

export type PanelQuad = {
  /** Four corners in world metres (the face's coordinate system),
   *  ordered CCW from outside the face. */
  corners: [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3];
};

/** Lay out panels on a single face. Returns an empty array if the face
 *  is not PV-eligible, too small, or the layout would fit zero panels. */
export function layoutPanels(
  face: RoofFace,
  worldVerts: THREE.Vector3[],
  marginM: number = DEFAULT_MARGIN_M,
): PanelQuad[] {
  if (!face.is_pv_eligible || worldVerts.length < 3) return [];
  const normal = polygonNormal(worldVerts);
  if (!normal) return [];

  // Build an in-plane (u, v) basis. u points along the first edge of
  // the polygon; v is perpendicular to u inside the face plane.
  const origin = worldVerts[0]!.clone();
  const u = new THREE.Vector3().subVectors(worldVerts[1]!, origin);
  if (u.lengthSq() < 1e-9) return [];
  u.normalize();
  const v = new THREE.Vector3().crossVectors(normal, u).normalize();

  // Project polygon to UV.
  const uv = worldVerts.map((p) => {
    const d = new THREE.Vector3().subVectors(p, origin);
    return { u: d.dot(u), v: d.dot(v) };
  });
  let minU = Number.POSITIVE_INFINITY;
  let maxU = Number.NEGATIVE_INFINITY;
  let minV = Number.POSITIVE_INFINITY;
  let maxV = Number.NEGATIVE_INFINITY;
  for (const p of uv) {
    if (p.u < minU) minU = p.u;
    if (p.u > maxU) maxU = p.u;
    if (p.v < minV) minV = p.v;
    if (p.v > maxV) maxV = p.v;
  }
  // Inset the bounding box by the eave margin. A real Minkowski-offset
  // of the polygon would be more correct on non-rectangular faces but
  // the corner-in-polygon test below catches the same cases.
  minU += marginM;
  maxU -= marginM;
  minV += marginM;
  maxV -= marginM;
  if (maxU - minU < 0.5 || maxV - minV < 0.5) return [];

  // Derive panel width/height from area, keeping the typical residential
  // landscape aspect ratio so a 1.95 m² panel comes out ≈ 1.70 × 1.15 m.
  const area = face.panel_size_m2 || 1.95;
  const panelH = Math.sqrt(area / PANEL_ASPECT);
  const panelW = panelH * PANEL_ASPECT;

  // Try landscape and portrait orientations, keep the layout that fits
  // more panels (small flat areas sometimes pack more cells if the
  // panels are rotated).
  const landscape = tileRect(minU, maxU, minV, maxV, panelW, panelH, PANEL_GAP_M, uv);
  const portrait = tileRect(minU, maxU, minV, maxV, panelH, panelW, PANEL_GAP_M, uv);
  const best = landscape.length >= portrait.length ? landscape : portrait;

  // Honour the face's max_coverage_pct: the grid above is the densest
  // packing that fits, but the user's coverage slider expresses how much
  // of that they actually want to install (accounting for inverter
  // capacity, setbacks, walkways, future expansion). Match the panel
  // count summarisePv reports — so the kWp/kWh figures in the inspector
  // always match what's on screen.
  const coverage = Math.max(0, Math.min(100, face.max_coverage_pct ?? 70)) / 100;
  const targetCount = Math.floor((face.area_m2 * coverage) / area);

  // Sort the grid by distance from the inset center so that as the user
  // lowers coverage, panels get pruned from the edges inwards — the
  // remaining array sits centred on the roof, the way a real install
  // would group around the structural sweet spot rather than huddling
  // in a corner. Ties stay row-major (no perceptible effect either way).
  const centerU = (minU + maxU) / 2;
  const centerV = (minV + maxV) / 2;
  const byCenter = [...best].sort((a, b) => {
    const acx = (a.uStart + a.uEnd) / 2 - centerU;
    const acy = (a.vStart + a.vEnd) / 2 - centerV;
    const bcx = (b.uStart + b.uEnd) / 2 - centerU;
    const bcy = (b.vStart + b.vEnd) / 2 - centerV;
    return acx * acx + acy * acy - (bcx * bcx + bcy * bcy);
  });
  const limited = byCenter.slice(0, targetCount);

  return limited.map((q) => ({
    corners: [
      uvTo3D(origin, u, v, q.uStart, q.vStart),
      uvTo3D(origin, u, v, q.uEnd, q.vStart),
      uvTo3D(origin, u, v, q.uEnd, q.vEnd),
      uvTo3D(origin, u, v, q.uStart, q.vEnd),
    ],
  }));
}

function tileRect(
  minU: number,
  maxU: number,
  minV: number,
  maxV: number,
  panelW: number,
  panelH: number,
  gap: number,
  uv: Array<{ u: number; v: number }>,
): Array<{ uStart: number; uEnd: number; vStart: number; vEnd: number }> {
  const out: Array<{ uStart: number; uEnd: number; vStart: number; vEnd: number }> = [];
  for (let vStart = minV; vStart + panelH <= maxV + 1e-6; vStart += panelH + gap) {
    for (let uStart = minU; uStart + panelW <= maxU + 1e-6; uStart += panelW + gap) {
      const uEnd = uStart + panelW;
      const vEnd = vStart + panelH;
      if (
        pointInPolygon2D(uStart, vStart, uv) &&
        pointInPolygon2D(uEnd, vStart, uv) &&
        pointInPolygon2D(uEnd, vEnd, uv) &&
        pointInPolygon2D(uStart, vEnd, uv)
      ) {
        out.push({ uStart, uEnd, vStart, vEnd });
      }
    }
  }
  return out;
}

function uvTo3D(
  origin: THREE.Vector3,
  u: THREE.Vector3,
  v: THREE.Vector3,
  uVal: number,
  vVal: number,
): THREE.Vector3 {
  return new THREE.Vector3().copy(origin).addScaledVector(u, uVal).addScaledVector(v, vVal);
}

function pointInPolygon2D(x: number, y: number, poly: Array<{ u: number; v: number }>): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i]!.u;
    const yi = poly[i]!.v;
    const xj = poly[j]!.u;
    const yj = poly[j]!.v;
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

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
