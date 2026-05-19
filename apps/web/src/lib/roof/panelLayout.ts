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
/** Walkway gap between adjacent arrays when array_count > 1. Wider than
 *  PANEL_GAP_M so the split reads as deliberate, not as missing panels. */
const ARRAY_GAP_M = 0.8;

export type PanelQuad = {
  /** Four corners in world metres (the face's coordinate system),
   *  ordered CCW from outside the face. */
  corners: [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3];
};

type UVPoint = { u: number; v: number };
type UVQuad = { uStart: number; uEnd: number; vStart: number; vEnd: number };

/** Lay out panels on a single face. Returns an empty array if the face
 *  is not PV-eligible, too small, or the layout would fit zero panels.
 *  Respects face.max_coverage_pct (proportional pruning from the centre
 *  outward) and face.array_count (split into N strips along the longer
 *  axis with a walkway gap between them). */
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
  const insetBox = boundingBox(uv);
  insetBox.minU += marginM;
  insetBox.maxU -= marginM;
  insetBox.minV += marginM;
  insetBox.maxV -= marginM;
  if (insetBox.maxU - insetBox.minU < 0.5 || insetBox.maxV - insetBox.minV < 0.5) return [];

  // Derive panel width/height from area, keeping the typical residential
  // landscape aspect ratio so a 1.95 m² panel comes out ≈ 1.70 × 1.15 m.
  const panelArea = face.panel_size_m2 || 1.95;
  const panelH = Math.sqrt(panelArea / PANEL_ASPECT);
  const panelW = panelH * PANEL_ASPECT;

  // Total panels we want to render across all arrays — matches what
  // summarisePv reports so kWp/kWh on screen stays consistent.
  const coverage = Math.max(0, Math.min(100, face.max_coverage_pct ?? 70)) / 100;
  const targetCount = Math.floor((face.area_m2 * coverage) / panelArea);
  if (targetCount === 0) return [];

  // Split the inset bounding box into N strips along its longer axis,
  // each separated by ARRAY_GAP_M. Each strip becomes one independent
  // array — own grid, own center-out pruning. With array_count = 1 the
  // loop runs once and we get the original single-array behaviour.
  const arrayCount = Math.max(1, Math.min(8, Math.floor(face.array_count ?? 1)));
  const strips = splitStrips(insetBox, arrayCount);

  const out: UVQuad[] = [];
  // Divide the target count between strips. We give floor(N/k) to each
  // strip and spread the remainder one per strip — keeps the totals
  // matching summarisePv as closely as possible.
  const baseShare = Math.floor(targetCount / arrayCount);
  const remainder = targetCount - baseShare * arrayCount;
  for (let i = 0; i < strips.length; i++) {
    const share = baseShare + (i < remainder ? 1 : 0);
    if (share === 0) continue;
    const stripPanels = layoutStrip(strips[i]!, uv, panelW, panelH, share);
    out.push(...stripPanels);
  }

  return out.map((q) => ({
    corners: [
      uvTo3D(origin, u, v, q.uStart, q.vStart),
      uvTo3D(origin, u, v, q.uEnd, q.vStart),
      uvTo3D(origin, u, v, q.uEnd, q.vEnd),
      uvTo3D(origin, u, v, q.uStart, q.vEnd),
    ],
  }));
}

/** Split a bounding box into N equal strips along its longer axis,
 *  leaving ARRAY_GAP_M between adjacent strips. The strip boxes are
 *  returned in order so the inspector can map array number ↔ strip. */
function splitStrips(
  box: { minU: number; maxU: number; minV: number; maxV: number },
  count: number,
): Array<{ minU: number; maxU: number; minV: number; maxV: number }> {
  if (count <= 1) return [box];
  const w = box.maxU - box.minU;
  const h = box.maxV - box.minV;
  const splitAlongU = w >= h;
  const span = splitAlongU ? w : h;
  // Each strip gets (span - (N-1)*gap) / N of the longer axis.
  const stripLen = (span - (count - 1) * ARRAY_GAP_M) / count;
  if (stripLen < 0.5) return [box]; // gaps would eat all the space — fall back
  const strips: Array<{ minU: number; maxU: number; minV: number; maxV: number }> = [];
  for (let i = 0; i < count; i++) {
    const start = i * (stripLen + ARRAY_GAP_M);
    const end = start + stripLen;
    if (splitAlongU) {
      strips.push({
        minU: box.minU + start,
        maxU: box.minU + end,
        minV: box.minV,
        maxV: box.maxV,
      });
    } else {
      strips.push({
        minU: box.minU,
        maxU: box.maxU,
        minV: box.minV + start,
        maxV: box.minV + end,
      });
    }
  }
  return strips;
}

/** Lay out a single strip: tile a grid (best of landscape / portrait),
 *  sort by Chebyshev distance in axis-normalised coords (so pruning
 *  keeps a rectangle proportional to the strip rather than a circle),
 *  return the closest `share` panels to the strip centre. */
function layoutStrip(
  strip: { minU: number; maxU: number; minV: number; maxV: number },
  poly: UVPoint[],
  panelW: number,
  panelH: number,
  share: number,
): UVQuad[] {
  const { minU, maxU, minV, maxV } = strip;
  if (maxU - minU < panelW + 0.1 || maxV - minV < panelH + 0.1) {
    // Strip too small for even one landscape panel; try portrait only.
    const portrait = tileRect(minU, maxU, minV, maxV, panelH, panelW, PANEL_GAP_M, poly);
    return sliceProportional(portrait, strip, share);
  }
  const landscape = tileRect(minU, maxU, minV, maxV, panelW, panelH, PANEL_GAP_M, poly);
  const portrait = tileRect(minU, maxU, minV, maxV, panelH, panelW, PANEL_GAP_M, poly);
  const best = landscape.length >= portrait.length ? landscape : portrait;
  return sliceProportional(best, strip, share);
}

/** Sort grid by Chebyshev distance in normalised (per-axis) coordinates
 *  so the kept cluster stays in the same aspect ratio as the strip. At
 *  50% coverage on a 20×10 strip you get a ~14×7 cluster (linear scale
 *  per axis ≈ √0.5 ≈ 0.71), not a circle. */
function sliceProportional(
  grid: UVQuad[],
  strip: { minU: number; maxU: number; minV: number; maxV: number },
  share: number,
): UVQuad[] {
  if (grid.length <= share) return grid;
  const cu = (strip.minU + strip.maxU) / 2;
  const cv = (strip.minV + strip.maxV) / 2;
  const halfW = Math.max(0.001, (strip.maxU - strip.minU) / 2);
  const halfH = Math.max(0.001, (strip.maxV - strip.minV) / 2);
  const sorted = [...grid].sort((a, b) => {
    const acx = Math.abs((a.uStart + a.uEnd) / 2 - cu) / halfW;
    const acy = Math.abs((a.vStart + a.vEnd) / 2 - cv) / halfH;
    const bcx = Math.abs((b.uStart + b.uEnd) / 2 - cu) / halfW;
    const bcy = Math.abs((b.vStart + b.vEnd) / 2 - cv) / halfH;
    return Math.max(acx, acy) - Math.max(bcx, bcy);
  });
  return sorted.slice(0, share);
}

function boundingBox(pts: UVPoint[]): {
  minU: number;
  maxU: number;
  minV: number;
  maxV: number;
} {
  let minU = Number.POSITIVE_INFINITY;
  let maxU = Number.NEGATIVE_INFINITY;
  let minV = Number.POSITIVE_INFINITY;
  let maxV = Number.NEGATIVE_INFINITY;
  for (const p of pts) {
    if (p.u < minU) minU = p.u;
    if (p.u > maxU) maxU = p.u;
    if (p.v < minV) minV = p.v;
    if (p.v > maxV) maxV = p.v;
  }
  return { minU, maxU, minV, maxV };
}

function tileRect(
  minU: number,
  maxU: number,
  minV: number,
  maxV: number,
  panelW: number,
  panelH: number,
  gap: number,
  uv: UVPoint[],
): UVQuad[] {
  const out: UVQuad[] = [];
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

function pointInPolygon2D(x: number, y: number, poly: UVPoint[]): boolean {
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
