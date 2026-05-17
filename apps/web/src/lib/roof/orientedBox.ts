// Oriented bounding box of a polygon footprint in local metres.
//
// Convention used everywhere in the roof engine:
//   - OBB-local +X axis runs along the box's `length` (long dimension)
//   - OBB-local +Y axis runs along the box's `width` (perpendicular)
//   - `rotation` is the math angle (radians, CCW from world +X) of the long
//     axis in world coordinates
//
// boxToWorld / worldToBox are exact inverses, and the round-trip preserves
// the OBB-local axes (no swap, no sign flip). Generators that lay out
// geometry as `(±halfL, ±halfW)` and emit polygons via `boxToWorld(...)` see
// those polygons land exactly on the rotated footprint.
//
// Phase 1 still falls back to the OBB fit for non-rectangular footprints —
// true straight-skeleton support for L-shapes is on the brief's escalation
// list.

import type { XY } from '@nza-pv/shared';

export type OrientedBox = {
  /** Box centre in local metres. */
  center: XY;
  /** Length along the OBB-local +X axis (the longest dimension). */
  length: number;
  /** Width along the OBB-local +Y axis. */
  width: number;
  /** Math angle (radians, CCW from world +X) of the long axis. */
  rotation: number;
  /** 4 corners in world metres, CCW starting bottom-left in OBB-local. */
  corners: [XY, XY, XY, XY];
};

export function orientedBoundingBox(points: XY[]): OrientedBox {
  if (points.length < 3) {
    const p = points[0] ?? [0, 0];
    return {
      center: p,
      length: 0,
      width: 0,
      rotation: 0,
      corners: [p, p, p, p],
    };
  }
  // Rotating-calipers approximation: for each hull edge, fit a rectangle
  // whose sides are parallel/perpendicular to that edge and pick the one
  // with the smallest area.
  const hull = convexHull(points);
  let best: OrientedBox | null = null;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i] as XY;
    const b = hull[(i + 1) % hull.length] as XY;
    // Math angle of the edge direction.
    const edgeAngle = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const box = boxAlongAngle(points, edgeAngle);
    if (!best || box.length * box.width < best.length * best.width) best = box;
  }
  return best ?? boxAlongAngle(points, 0);
}

function boxAlongAngle(points: XY[], edgeAngle: number): OrientedBox {
  // Rotate points by -edgeAngle CCW so the edge aligns with world +X.
  // Then a plain axis-aligned bounding box gives us the OBB extents.
  const cos = Math.cos(-edgeAngle);
  const sin = Math.sin(-edgeAngle);
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const p of points) {
    const rx = p[0] * cos - p[1] * sin;
    const ry = p[0] * sin + p[1] * cos;
    if (rx < minX) minX = rx;
    if (rx > maxX) maxX = rx;
    if (ry < minY) minY = ry;
    if (ry > maxY) maxY = ry;
  }
  const w = maxX - minX; // along edge direction
  const h = maxY - minY; // perpendicular to edge
  const longAlongEdge = w >= h;
  const length = longAlongEdge ? w : h;
  const width = longAlongEdge ? h : w;
  // The long axis points along the edge direction when w >= h, otherwise
  // perpendicular to it. Math angle of the long axis in world coords:
  const rotation = longAlongEdge ? edgeAngle : edgeAngle + Math.PI / 2;
  // Centre: in derotated frame, then rotated back to world by +edgeAngle CCW.
  const dcx = (minX + maxX) / 2;
  const dcy = (minY + maxY) / 2;
  const cosBack = Math.cos(edgeAngle);
  const sinBack = Math.sin(edgeAngle);
  const center: XY = [dcx * cosBack - dcy * sinBack, dcx * sinBack + dcy * cosBack];
  const corners = derotatedCornersToWorld(minX, maxX, minY, maxY, edgeAngle);
  return { center, length, width, rotation, corners };
}

function derotatedCornersToWorld(
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  edgeAngle: number,
): [XY, XY, XY, XY] {
  const cos = Math.cos(edgeAngle);
  const sin = Math.sin(edgeAngle);
  const pts: XY[] = [
    [minX, minY],
    [maxX, minY],
    [maxX, maxY],
    [minX, maxY],
  ];
  return pts.map((p) => [p[0] * cos - p[1] * sin, p[0] * sin + p[1] * cos] as XY) as [
    XY,
    XY,
    XY,
    XY,
  ];
}

// Andrew's monotone chain convex hull.
function convexHull(points: XY[]): XY[] {
  const pts = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length <= 1) return pts;
  const cross = (o: XY, a: XY, b: XY) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: XY[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0)
      lower.pop();
    lower.push(p);
  }
  const upper: XY[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i] as XY;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0)
      upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

/** Convert an OBB-local point `(lx, ly)` to world metres.
 *  +X is along length, +Y is along width — `box.rotation` is the math angle
 *  CCW from world +X of the OBB-local +X axis. */
export function boxToWorld(p: XY, box: OrientedBox): XY {
  const lx = p[0];
  const ly = p[1];
  const cos = Math.cos(box.rotation);
  const sin = Math.sin(box.rotation);
  return [
    box.center[0] + lx * cos - ly * sin,
    box.center[1] + lx * sin + ly * cos,
  ];
}

/** Inverse of `boxToWorld`. */
export function worldToBox(p: XY, box: OrientedBox): XY {
  const dx = p[0] - box.center[0];
  const dy = p[1] - box.center[1];
  const cos = Math.cos(box.rotation);
  const sin = Math.sin(box.rotation);
  return [dx * cos + dy * sin, -dx * sin + dy * cos];
}
