// Geographic helpers: convert lat/lon ↔ local-metres around an anchor.
// We work in a flat XY-metres plane while editing/rendering buildings, then
// only round-trip back to lat/lon for persistence. Accurate to <1 cm over the
// few-hundred-metre scale of a campus.

import type { Polygon } from 'geojson';

const EARTH_RADIUS_M = 6_378_137; // WGS84 equatorial radius
const DEG = Math.PI / 180;

export type LngLat = [number, number]; // [longitude, latitude]
export type XY = [number, number]; // metres east, metres north

/** Convert a lng/lat coordinate to local metres around `anchor`. */
export function lngLatToMeters(point: LngLat, anchor: LngLat): XY {
  const [lng, lat] = point;
  const [aLng, aLat] = anchor;
  const meanLat = (lat + aLat) * 0.5 * DEG;
  const x = (lng - aLng) * DEG * EARTH_RADIUS_M * Math.cos(meanLat);
  const y = (lat - aLat) * DEG * EARTH_RADIUS_M;
  return [x, y];
}

/** Inverse of `lngLatToMeters`. */
export function metersToLngLat(xy: XY, anchor: LngLat): LngLat {
  const [x, y] = xy;
  const [aLng, aLat] = anchor;
  const lat = aLat + (y / EARTH_RADIUS_M) / DEG;
  const meanLat = (lat + aLat) * 0.5 * DEG;
  const lng = aLng + (x / (EARTH_RADIUS_M * Math.cos(meanLat))) / DEG;
  return [lng, lat];
}

/** Centroid of a polygon's outer ring (lng/lat). */
export function polygonCentroidLngLat(polygon: Polygon): LngLat {
  const ring = polygon.coordinates[0] ?? [];
  if (ring.length === 0) return [0, 0];
  let sx = 0;
  let sy = 0;
  // Skip the closing duplicate vertex.
  const last = ring.length - 1;
  const count = ring[0] === ring[last] ? last : ring.length;
  for (let i = 0; i < count; i++) {
    const p = ring[i] as [number, number];
    sx += p[0];
    sy += p[1];
  }
  return [sx / count, sy / count];
}

/** Project a lng/lat polygon outer ring into local metres around `anchor`. */
export function polygonRingToMeters(polygon: Polygon, anchor: LngLat): XY[] {
  const ring = polygon.coordinates[0] ?? [];
  const out: XY[] = [];
  const last = ring.length - 1;
  const count = ring[0] === ring[last] && ring.length > 1 ? last : ring.length;
  for (let i = 0; i < count; i++) {
    const p = ring[i] as [number, number];
    out.push(lngLatToMeters([p[0], p[1]], anchor));
  }
  return out;
}

/** Shoelace area of a 2D polygon (metres²). Sign indicates winding. */
export function signedAreaXY(ring: XY[]): number {
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i] as XY;
    const b = ring[(i + 1) % ring.length] as XY;
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s * 0.5;
}

/** Absolute polygon area in m². */
export function polygonAreaM2(polygon: Polygon, anchor?: LngLat): number {
  const a = anchor ?? polygonCentroidLngLat(polygon);
  return Math.abs(signedAreaXY(polygonRingToMeters(polygon, a)));
}

/** Ensures the ring is counter-clockwise (positive shoelace area). */
export function ensureCCW(ring: XY[]): XY[] {
  return signedAreaXY(ring) < 0 ? [...ring].reverse() : ring;
}

/** Area of a 3D triangle. */
export function triangleArea3D(
  a: [number, number, number],
  b: [number, number, number],
  c: [number, number, number],
): number {
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const abz = b[2] - a[2];
  const acx = c[0] - a[0];
  const acy = c[1] - a[1];
  const acz = c[2] - a[2];
  const cx = aby * acz - abz * acy;
  const cy = abz * acx - abx * acz;
  const cz = abx * acy - aby * acx;
  return 0.5 * Math.hypot(cx, cy, cz);
}

/** Area of a 3D planar polygon by fan triangulation. */
export function polygon3DArea(verts: Array<[number, number, number]>): number {
  if (verts.length < 3) return 0;
  let total = 0;
  const a = verts[0] as [number, number, number];
  for (let i = 1; i < verts.length - 1; i++) {
    total += triangleArea3D(a, verts[i] as [number, number, number], verts[i + 1] as [number, number, number]);
  }
  return total;
}

/** Tilt of a planar polygon (degrees from horizontal, 0–90). */
export function polygonTiltDeg(verts: Array<[number, number, number]>): number {
  const n = planeNormal(verts);
  if (!n) return 0;
  const upDot = Math.abs(n[2]);
  return (Math.acos(Math.min(1, Math.max(0, upDot))) * 180) / Math.PI;
}

/** Azimuth of a planar polygon's down-slope direction (degrees from north,
 *  0..360, where E=90). Returns 0 for horizontal surfaces. */
export function polygonAzimuthDeg(verts: Array<[number, number, number]>): number {
  const n = planeNormal(verts);
  if (!n) return 0;
  // Down-slope direction is the negation of the horizontal projection of the normal.
  const dx = -n[0];
  const dy = -n[1];
  const horiz = Math.hypot(dx, dy);
  if (horiz < 1e-9) return 0; // flat
  // atan2(x, y) so that 0 = +Y (north), 90 = +X (east).
  const az = (Math.atan2(dx, dy) * 180) / Math.PI;
  return (az + 360) % 360;
}

export function azimuthToCardinal(az: number): 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW' {
  const a = ((az % 360) + 360) % 360;
  const idx = Math.round(a / 45) % 8;
  return (['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const)[idx]!;
}

/** Newell's method normal for a planar 3D polygon (returns unit vector). */
function planeNormal(verts: Array<[number, number, number]>): [number, number, number] | null {
  if (verts.length < 3) return null;
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < verts.length; i++) {
    const a = verts[i] as [number, number, number];
    const b = verts[(i + 1) % verts.length] as [number, number, number];
    nx += (a[1] - b[1]) * (a[2] + b[2]);
    ny += (a[2] - b[2]) * (a[0] + b[0]);
    nz += (a[0] - b[0]) * (a[1] + b[1]);
  }
  const len = Math.hypot(nx, ny, nz);
  if (len < 1e-12) return null;
  return [nx / len, ny / len, nz / len];
}
