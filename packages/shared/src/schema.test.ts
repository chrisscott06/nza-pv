import { describe, expect, it } from 'vitest';
import {
  ROOF_STYLES,
  SCHEMA_VERSION,
  azimuthToCardinal,
  defaultFaceEligibility,
  isProjectFile,
  lngLatToMeters,
  metersToLngLat,
  polygonAreaM2,
  polygonAzimuthDeg,
  polygonTiltDeg,
  summarisePv,
} from './index.js';

describe('schema', () => {
  it('exposes all 12 roof styles', () => {
    expect(ROOF_STYLES).toHaveLength(12);
  });

  it('isProjectFile rejects non-objects and wrong versions', () => {
    expect(isProjectFile(null)).toBe(false);
    expect(isProjectFile({})).toBe(false);
    expect(isProjectFile({ schema_version: '0.9', project: {}, buildings: [] })).toBe(false);
    expect(isProjectFile({ schema_version: SCHEMA_VERSION, project: {}, buildings: [] })).toBe(
      true,
    );
  });
});

describe('geo', () => {
  it('round-trips lng/lat → metres → lng/lat within mm', () => {
    const anchor: [number, number] = [-2.3013, 51.9213];
    const original: [number, number] = [-2.3009, 51.9216];
    const xy = lngLatToMeters(original, anchor);
    const back = metersToLngLat(xy, anchor);
    expect(back[0]).toBeCloseTo(original[0], 7);
    expect(back[1]).toBeCloseTo(original[1], 7);
  });

  it('measures a 10m × 5m rectangle as 50 m²', () => {
    const anchor: [number, number] = [-2.3013, 51.9213];
    const corners: Array<[number, number]> = [
      metersToLngLat([0, 0], anchor),
      metersToLngLat([10, 0], anchor),
      metersToLngLat([10, 5], anchor),
      metersToLngLat([0, 5], anchor),
    ];
    const polygon = {
      type: 'Polygon' as const,
      coordinates: [[...corners, corners[0]!]],
    };
    const area = polygonAreaM2(polygon, anchor);
    expect(area).toBeCloseTo(50, 1);
  });

  it('computes tilt and azimuth for a 30° south-facing roof face', () => {
    // A face sloping from y=0 ridge down to y=5 eave over a 30° pitch.
    // Ridge at z = 5 * tan(30°), eave at z = 0.
    const ridgeZ = 5 * Math.tan((30 * Math.PI) / 180);
    const verts: Array<[number, number, number]> = [
      [0, 0, ridgeZ],
      [10, 0, ridgeZ],
      [10, -5, 0],
      [0, -5, 0],
    ];
    expect(polygonTiltDeg(verts)).toBeCloseTo(30, 1);
    const az = polygonAzimuthDeg(verts);
    expect(az).toBeGreaterThan(170);
    expect(az).toBeLessThan(190);
    expect(azimuthToCardinal(az)).toBe('S');
  });
});

describe('pv', () => {
  it('defaults eligibility based on tilt', () => {
    expect(defaultFaceEligibility({ tilt_deg: 0 })).toBe(true);
    expect(defaultFaceEligibility({ tilt_deg: 30 })).toBe(true);
    expect(defaultFaceEligibility({ tilt_deg: 60 })).toBe(true);
    expect(defaultFaceEligibility({ tilt_deg: 75 })).toBe(false);
  });

  it('summarises a 100 m² face at 70% coverage and 1.95 m² panels', () => {
    const summary = summarisePv({
      id: 'f1',
      role: 'main',
      cardinal: 'S',
      geometry: { type: 'Polygon', coordinates: [[]] },
      area_m2: 100,
      tilt_deg: 30,
      azimuth_deg: 180,
      is_pv_eligible: true,
      max_coverage_pct: 70,
      panel_size_m2: 1.95,
    });
    expect(summary.usable_area_m2).toBeCloseTo(70, 1);
    expect(summary.panel_count).toBe(35); // floor(70 / 1.95)
    expect(summary.nominal_kwp).toBeGreaterThan(13);
    expect(summary.nominal_kwp).toBeLessThan(15);
  });

  it('returns zeros when face is not PV-eligible', () => {
    const summary = summarisePv({
      id: 'f1',
      role: 'main',
      cardinal: 'N',
      geometry: { type: 'Polygon', coordinates: [[]] },
      area_m2: 100,
      tilt_deg: 30,
      azimuth_deg: 0,
      is_pv_eligible: false,
      max_coverage_pct: 70,
      panel_size_m2: 1.95,
    });
    expect(summary.panel_count).toBe(0);
    expect(summary.nominal_kwp).toBe(0);
  });
});
