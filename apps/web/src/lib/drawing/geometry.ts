import type { Polygon } from 'geojson';

export type LngLat = [number, number];

/** Build a rectangle Polygon from two lng/lat corners. Always returns a
 *  4-vertex outer ring (5 vertices including the closing duplicate). */
export function rectanglePolygon(a: LngLat, b: LngLat): Polygon {
  const minLng = Math.min(a[0], b[0]);
  const maxLng = Math.max(a[0], b[0]);
  const minLat = Math.min(a[1], b[1]);
  const maxLat = Math.max(a[1], b[1]);
  return {
    type: 'Polygon',
    coordinates: [
      [
        [minLng, minLat],
        [maxLng, minLat],
        [maxLng, maxLat],
        [minLng, maxLat],
        [minLng, minLat],
      ],
    ],
  };
}

/** Polygon from a vertex list (auto-closes). */
export function polygonFromVertices(verts: LngLat[]): Polygon {
  if (verts.length < 3) {
    return { type: 'Polygon', coordinates: [[]] };
  }
  const ring = [...verts, verts[0]!];
  return { type: 'Polygon', coordinates: [ring] };
}

/** Snap a free-floating polygon-in-progress to right angles, optionally
 *  honouring a per-vertex shift override.
 *  Algorithm: starting from the second vertex, replace each vertex's position
 *  so that the segment from prev to this one is axis-aligned to one of
 *  (-180°, -90°, 0°, 90°) relative to the prior segment (or true north if it's
 *  the first edge). */
export function snapRightAngle(verts: LngLat[]): LngLat[] {
  if (verts.length < 2) return verts;
  // For Phase 1, simple approach: snap segments to be axis-aligned to the
  // edges of the first segment. So once you draw 1→2, every subsequent
  // vertex extends in a multiple of 90° from edge 1→2.
  const out: LngLat[] = [verts[0]!];
  const a = verts[0]!;
  const b = verts[1]!;
  out.push(b);
  // basis vectors (lng/lat) from the first edge, normalised in degrees space.
  const ex = b[0] - a[0];
  const ey = b[1] - a[1];
  const len = Math.hypot(ex, ey) || 1;
  const ux = ex / len;
  const uy = ey / len;
  // Perpendicular (90° CCW).
  const px = -uy;
  const py = ux;
  let cursor = b;
  for (let i = 2; i < verts.length; i++) {
    const v = verts[i] as LngLat;
    const dx = v[0] - cursor[0];
    const dy = v[1] - cursor[1];
    const along = dx * ux + dy * uy;
    const across = dx * px + dy * py;
    const useAlong = Math.abs(along) >= Math.abs(across);
    const next: LngLat = useAlong
      ? [cursor[0] + along * ux, cursor[1] + along * uy]
      : [cursor[0] + across * px, cursor[1] + across * py];
    out.push(next);
    cursor = next;
  }
  return out;
}

/** Self-intersection test on a polygon's outer ring (lng/lat). True if any
 *  two non-adjacent edges cross. */
export function isSelfIntersecting(verts: LngLat[]): boolean {
  const n = verts.length;
  if (n < 4) return false;
  for (let i = 0; i < n - 1; i++) {
    const a1 = verts[i]!;
    const a2 = verts[i + 1]!;
    for (let j = i + 2; j < n - 1; j++) {
      if (i === 0 && j === n - 2) continue; // adjacent
      const b1 = verts[j]!;
      const b2 = verts[j + 1]!;
      if (segmentsIntersect(a1, a2, b1, b2)) return true;
    }
  }
  return false;
}

function segmentsIntersect(p: LngLat, p2: LngLat, q: LngLat, q2: LngLat): boolean {
  const d1 = sign(cross(q, q2, p));
  const d2 = sign(cross(q, q2, p2));
  const d3 = sign(cross(p, p2, q));
  const d4 = sign(cross(p, p2, q2));
  if (d1 !== d2 && d3 !== d4) return true;
  return false;
}

function cross(a: LngLat, b: LngLat, c: LngLat): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function sign(n: number): number {
  return n > 0 ? 1 : n < 0 ? -1 : 0;
}
