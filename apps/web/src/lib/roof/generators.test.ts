// Roof generator unit tests — the brief explicitly calls out a 10×5 hip,
// a 10×5 gable on the long axis, and an L-shape hip. We cover the rectangle
// scenarios here; L-shape coverage falls back to the OBB (a known limitation
// documented in the brief escalation list).

import { type Building, type Polygon, metersToLngLat, polygonAreaM2 } from '@nza-pv/shared';
import { describe, expect, it } from 'vitest';
import { defaultRoofForStyle } from './presets.js';
import { regenerateFaces } from './regenerate.js';

const ANCHOR: [number, number] = [-2.3013, 51.9213];

function makeRect(lengthM: number, widthM: number, rotRad = 0): Polygon {
  const halfL = lengthM / 2;
  const halfW = widthM / 2;
  // Build local-metres rect, then rotate by rotRad CCW around the centroid,
  // then project to lng/lat.
  const cos = Math.cos(rotRad);
  const sin = Math.sin(rotRad);
  const rot = ([x, y]: [number, number]): [number, number] => [
    x * cos - y * sin,
    x * sin + y * cos,
  ];
  const corners: Array<[number, number]> = [
    metersToLngLat(rot([-halfL, -halfW]), ANCHOR),
    metersToLngLat(rot([halfL, -halfW]), ANCHOR),
    metersToLngLat(rot([halfL, halfW]), ANCHOR),
    metersToLngLat(rot([-halfL, halfW]), ANCHOR),
  ];
  return { type: 'Polygon', coordinates: [[...corners, corners[0]!]] };
}

function makeBuilding(footprint: Polygon, eave = 6): Building {
  return {
    id: 'test',
    name: 'Test',
    footprint,
    storeys: 2,
    storey_height_m: 3,
    eave_height_m: eave,
    roof: defaultRoofForStyle('hip'),
    faces: [],
  };
}

describe('rectangle area sanity', () => {
  it('10m × 5m rectangle measures 50 m²', () => {
    const rect = makeRect(10, 5);
    expect(polygonAreaM2(rect, ANCHOR)).toBeCloseTo(50, 1);
  });
});

describe('hip roof on a 10m × 5m rectangle at 30°', () => {
  const rect = makeRect(10, 5);
  const b = { ...makeBuilding(rect), roof: { style: 'hip' as const, pitch_deg: 30 } };
  const faces = regenerateFaces(b);

  it('produces 4 faces', () => {
    expect(faces).toHaveLength(4);
  });

  it('has two main faces and two hip ends', () => {
    expect(faces.filter((f) => f.role === 'main')).toHaveLength(2);
    expect(faces.filter((f) => f.role === 'hip_end')).toHaveLength(2);
  });

  it('all four sloped faces tilt at ~30°', () => {
    for (const f of faces) expect(f.tilt_deg).toBeCloseTo(30, 0);
  });

  it('total face area is within 0.5 m² of expected', () => {
    // For a rect with half-width 2.5 and pitch 30°, slope area = footprint / cos(30°).
    const expected = 50 / Math.cos((30 * Math.PI) / 180);
    const total = faces.reduce((s, f) => s + f.area_m2, 0);
    expect(total).toBeCloseTo(expected, 0);
  });
});

describe('gable roof on a 10m × 5m rectangle at 30°, long-axis ridge', () => {
  const rect = makeRect(10, 5);
  const b = {
    ...makeBuilding(rect),
    roof: { style: 'gable' as const, pitch_deg: 30, ridge_axis: 'longest' as const },
  };
  const faces = regenerateFaces(b);

  it('produces 4 faces (2 main + 2 gable end walls)', () => {
    expect(faces).toHaveLength(4);
    expect(faces.filter((f) => f.role === 'main')).toHaveLength(2);
    expect(faces.filter((f) => f.role === 'gable_end_wall')).toHaveLength(2);
  });

  it('main faces tilt at ~30°', () => {
    const mains = faces.filter((f) => f.role === 'main');
    for (const m of mains) expect(m.tilt_deg).toBeCloseTo(30, 0);
  });

  it('main faces face N and S (longest edge is E-W)', () => {
    const mains = faces.filter((f) => f.role === 'main');
    const cardinals = mains.map((m) => m.cardinal).sort();
    expect(cardinals).toEqual(['N', 'S']);
  });
});

describe('flat roof has a single horizontal face', () => {
  const rect = makeRect(10, 5);
  const b = {
    ...makeBuilding(rect),
    roof: { style: 'flat' as const, parapet_height_m: 0 },
  };
  const faces = regenerateFaces(b);
  it('returns one face with tilt ≈ 0', () => {
    expect(faces).toHaveLength(1);
    expect(faces[0]!.tilt_deg).toBeCloseTo(0, 0);
    expect(faces[0]!.cardinal).toBe('flat');
    expect(faces[0]!.area_m2).toBeCloseTo(50, 0);
  });
});

describe('roof stays on the building footprint at any rotation', () => {
  // For a perfect rectangle, the OBB IS the rectangle, so the roof's XY
  // bounding box must match the footprint's XY bounding box to within a few
  // millimetres at any rotation. This is the user-reported "roof flies off
  // the building after rotation" check.
  function rectBBox(rect: Polygon): { minLng: number; maxLng: number; minLat: number; maxLat: number } {
    const ring = rect.coordinates[0] ?? [];
    let minLng = Number.POSITIVE_INFINITY;
    let maxLng = Number.NEGATIVE_INFINITY;
    let minLat = Number.POSITIVE_INFINITY;
    let maxLat = Number.NEGATIVE_INFINITY;
    for (const c of ring) {
      const lng = c[0]!;
      const lat = c[1]!;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
    return { minLng, maxLng, minLat, maxLat };
  }
  function facesBBox(faces: ReturnType<typeof regenerateFaces>): {
    minLng: number;
    maxLng: number;
    minLat: number;
    maxLat: number;
  } {
    let minLng = Number.POSITIVE_INFINITY;
    let maxLng = Number.NEGATIVE_INFINITY;
    let minLat = Number.POSITIVE_INFINITY;
    let maxLat = Number.NEGATIVE_INFINITY;
    for (const f of faces) {
      for (const c of f.geometry.coordinates[0] ?? []) {
        const lng = (c as unknown as number[])[0]!;
        const lat = (c as unknown as number[])[1]!;
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
    }
    return { minLng, maxLng, minLat, maxLat };
  }

  for (const rotDeg of [0, 15, 30, 45, 60, 75, 90, 135, -30]) {
    for (const style of ['hip', 'gable', 'mono', 'mansard', 'hip', 'pyramid'] as const) {
      it(`${style} aligns with the footprint at ${rotDeg}°`, () => {
        const rect = makeRect(12, 6, (rotDeg * Math.PI) / 180);
        const faces = regenerateFaces({
          ...makeBuilding(rect),
          roof: defaultRoofForStyle(style),
        });
        const expected = rectBBox(rect);
        const actual = facesBBox(faces);
        // 1e-6 in lng/lat ≈ 0.1m — generous tolerance for floating-point noise.
        const TOL = 1e-6;
        expect(Math.abs(actual.minLng - expected.minLng)).toBeLessThan(TOL);
        expect(Math.abs(actual.maxLng - expected.maxLng)).toBeLessThan(TOL);
        expect(Math.abs(actual.minLat - expected.minLat)).toBeLessThan(TOL);
        expect(Math.abs(actual.maxLat - expected.maxLat)).toBeLessThan(TOL);
      });
    }
  }
});

describe('all 12 presets generate at least one PV-eligible face on a typical rect', () => {
  const rect = makeRect(12, 6);
  for (const style of [
    'flat',
    'mono',
    'gable',
    'hip',
    'dutch_hip',
    'gambrel',
    'mansard',
    'saltbox',
    'sawtooth',
    'butterfly',
    'pyramid',
    'cross_gabled',
  ] as const) {
    it(`generates valid faces for ${style}`, () => {
      const roof = defaultRoofForStyle(style);
      const faces = regenerateFaces({
        ...makeBuilding(rect),
        roof,
      });
      expect(faces.length).toBeGreaterThan(0);
      const eligible = faces.filter((f) => f.is_pv_eligible);
      expect(eligible.length).toBeGreaterThan(0);
      for (const f of faces) expect(f.area_m2).toBeGreaterThanOrEqual(0);
    });
  }
});
