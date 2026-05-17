// Bulk operations — similarity matching for "apply roof to similar" and the
// shared logic behind match-heights / roof-copy.

import { type Building, polygonCentroidLngLat, polygonRingToMeters } from '@nza-pv/shared';
import { type OrientedBox, orientedBoundingBox } from './roof/orientedBox.js';

const AREA_TOLERANCE = 0.3; // ±30%
const ASPECT_TOLERANCE = 0.2; // ±20%
const ORIENTATION_TOLERANCE_DEG = 15;

type BoxedBuilding = {
  building: Building;
  box: OrientedBox;
  area: number;
  aspect: number;
  rotationDeg: number;
};

function box(b: Building): BoxedBuilding {
  const anchor = polygonCentroidLngLat(b.footprint);
  const ring = polygonRingToMeters(b.footprint, anchor);
  const obb = orientedBoundingBox(ring);
  const area = obb.length * obb.width;
  const aspect = obb.length / Math.max(0.0001, obb.width);
  // Normalise rotation to 0..180° (a rectangle's rotation is symmetric mod 180°).
  let rot = ((obb.rotation * 180) / Math.PI) % 180;
  if (rot < 0) rot += 180;
  return { building: b, box: obb, area, aspect, rotationDeg: rot };
}

/** Return building IDs similar to `source` (excluding source itself). */
export function findSimilar(source: Building, others: Building[]): string[] {
  const src = box(source);
  return others
    .filter((b) => b.id !== source.id)
    .map(box)
    .filter((c) => {
      const areaRatio = Math.abs(c.area - src.area) / src.area;
      const aspectRatio = Math.abs(c.aspect - src.aspect) / src.aspect;
      const rotDelta = Math.min(
        Math.abs(c.rotationDeg - src.rotationDeg),
        180 - Math.abs(c.rotationDeg - src.rotationDeg),
      );
      return (
        areaRatio <= AREA_TOLERANCE &&
        aspectRatio <= ASPECT_TOLERANCE &&
        rotDelta <= ORIENTATION_TOLERANCE_DEG
      );
    })
    .map((c) => c.building.id);
}
