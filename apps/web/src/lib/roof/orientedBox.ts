// Compute the oriented bounding box of a polygon footprint (in local metres).
// Phase 1 — primary path for non-rectangular footprints is the OBB fit, which
// gives gable / hip / mono / mansard / saltbox a sensible result on near-rect
// shapes. True straight-skeleton support for L-shapes is on the TODO list
// (see `briefs/phase-1-brief.md` flag list).

import type { XY } from '@nza-pv/shared';

export type OrientedBox = {
  /** Box centre in local metres. */
  center: XY;
  /** Length along the "long" axis (metres). */
  length: number;
  /** Width along the perpendicular axis (metres). */
  width: number;
  /** Rotation of the long axis, radians, from +Y (north) clockwise. */
  rotation: number;
  /** The 4 corners in original-metres coordinates, ordered CCW starting
   *  bottom-left in local (rotated) frame. */
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
  // For Phase 1, use the rotating-calipers approximation against the convex
  // hull — but in practice for nearly-rectangular footprints we just try a
  // range of edge angles and pick the smallest area box.
  const hull = convexHull(points);
  let best: OrientedBox | null = null;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i] as XY;
    const b = hull[(i + 1) % hull.length] as XY;
    const angle = Math.atan2(b[0] - a[0], b[1] - a[1]); // angle of edge in our frame
    const box = boxAtAngle(points, angle);
    if (!best || box.length * box.width < best.length * best.width) best = box;
  }
  return best ?? boxAtAngle(points, 0);
}

function boxAtAngle(points: XY[], angle: number): OrientedBox {
  // Rotate points by -angle so the box is axis-aligned, then compute bounds.
  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    const rx = p[0] * cos - p[1] * sin;
    const ry = p[0] * sin + p[1] * cos;
    if (rx < minX) minX = rx;
    if (rx > maxX) maxX = rx;
    if (ry < minY) minY = ry;
    if (ry > maxY) maxY = ry;
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const w = maxX - minX;
  const h = maxY - minY;
  // Reverse-rotate the centre back.
  const rcx = cx * Math.cos(angle) - cy * Math.sin(angle);
  const rcy = cx * Math.sin(angle) + cy * Math.cos(angle);
  // Long axis = the larger of (w, h). Rotation = angle aligned with that axis.
  const longAlongX = w >= h;
  const length = longAlongX ? w : h;
  const width = longAlongX ? h : w;
  const rotation = longAlongX ? angle - Math.PI / 2 : angle; // axis-of-length from north
  const corners = unrotatedCorners(minX, maxX, minY, maxY, angle);
  return { center: [rcx, rcy], length, width, rotation, corners };
}

function unrotatedCorners(minX: number, maxX: number, minY: number, maxY: number, angle: number): [XY, XY, XY, XY] {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const pts: XY[] = [
    [minX, minY],
    [maxX, minY],
    [maxX, maxY],
    [minX, maxY],
  ];
  return pts.map((p) => [p[0] * cos - p[1] * sin, p[0] * sin + p[1] * cos] as XY) as [XY, XY, XY, XY];
}

// Andrew's monotone chain convex hull.
function convexHull(points: XY[]): XY[] {
  const pts = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length <= 1) return pts;
  const cross = (o: XY, a: XY, b: XY) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: XY[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: XY[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i] as XY;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

/** Project a point from world (footprint-local) metres into OBB-local axes
 *  where +X is along `length` and +Y is along `width`. */
export function worldToBox(p: XY, box: OrientedBox): XY {
  const dx = p[0] - box.center[0];
  const dy = p[1] - box.center[1];
  const cos = Math.cos(-box.rotation);
  const sin = Math.sin(-box.rotation);
  // After rotation, length axis is +Y (north), so swap.
  const rx = dx * cos - dy * sin;
  const ry = dx * sin + dy * cos;
  return [ry, rx]; // x:=along length, y:=across width
}

/** Inverse of `worldToBox`. */
export function boxToWorld(p: XY, box: OrientedBox): XY {
  const rx = p[1];
  const ry = p[0];
  const cos = Math.cos(box.rotation);
  const sin = Math.sin(box.rotation);
  return [rx * cos - ry * sin + box.center[0], rx * sin + ry * cos + box.center[1]];
}
