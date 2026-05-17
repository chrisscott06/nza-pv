// Top-level: takes a Building, regenerates its `RoofFace[]`.

import {
  type Building,
  type Cardinal,
  type RoofFace,
  azimuthToCardinal,
  metersToLngLat,
  polygon3DArea,
  polygonAzimuthDeg,
  polygonCentroidLngLat,
  polygonRingToMeters,
  polygonTiltDeg,
} from '@nza-pv/shared';
import { nanoid } from 'nanoid';
import { generateRoof } from './generators.js';
import { boxToWorld, orientedBoundingBox } from './orientedBox.js';

const PV_ELIGIBLE_MAX_TILT = 60;

export function regenerateFaces(building: Building): RoofFace[] {
  const anchor = polygonCentroidLngLat(building.footprint);
  const ringMetres = polygonRingToMeters(building.footprint, anchor);
  if (ringMetres.length < 3) return [];

  const box = orientedBoundingBox(ringMetres);
  const halfL = box.length / 2;
  const halfW = box.width / 2;
  if (halfL <= 0 || halfW <= 0) return [];

  const localFaces = generateRoof(building.roof, {
    halfL,
    halfW,
    eave: building.eave_height_m,
    boxRotation: box.rotation,
  });

  const faces: RoofFace[] = localFaces.map((lf) => {
    // Convert each vertex from OBB-local back to world (metres), then to lng/lat.
    // OBB-local: x = along length, y = across width. Convert to world XY first.
    const worldRing: Array<[number, number, number]> = lf.ring.map(([lx, ly, lz]) => {
      const [wx, wy] = boxToWorld([lx, ly], box);
      return [wx, wy, lz];
    });
    const tilt = polygonTiltDeg(worldRing);
    const azimuth = polygonAzimuthDeg(worldRing);
    const cardinal: Cardinal = tilt < 1 ? 'flat' : azimuthToCardinal(azimuth);
    const area = polygon3DArea(worldRing);

    const coords = worldRing.map(([wx, wy, wz]) => {
      const [lng, lat] = metersToLngLat([wx, wy], anchor);
      return [lng, lat, wz] as [number, number, number];
    });
    // Close ring.
    const first = coords[0]!;
    coords.push([first[0], first[1], first[2]]);

    return {
      id: nanoid(8),
      role: lf.role,
      cardinal,
      geometry: { type: 'Polygon', coordinates: [coords as unknown as [number, number][]] },
      area_m2: round1(area),
      tilt_deg: round1(tilt),
      azimuth_deg: Math.round(azimuth),
      is_pv_eligible: tilt >= 0 && tilt <= PV_ELIGIBLE_MAX_TILT,
      max_coverage_pct: 70,
      panel_size_m2: 1.95,
    } satisfies RoofFace;
  });

  // Drop degenerate / vertical faces in the eligibility default but keep them
  // present so the inspector can show "non-PV" surfaces too.
  return faces;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
