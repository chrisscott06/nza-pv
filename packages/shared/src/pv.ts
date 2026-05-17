// Placeholder PV calculator — geometry-only nominal kWp.
// Real generation (kWh/year) lives in Phase 5 with PVGIS.

import {
  DEFAULT_MAX_COVERAGE_PCT,
  DEFAULT_PANEL_SIZE_M2,
  PV_ELIGIBLE_TILT_MAX_DEG,
  PV_ELIGIBLE_TILT_MIN_DEG,
  type RoofFace,
} from './schema.js';

/** Standard module nominal power density (kW per m² of panel area). Phase-1
 *  placeholder: a typical 400Wp panel at ~1.95 m² → ~0.205 kW/m². */
export const NOMINAL_KW_PER_M2 = 0.205;

export type FacePvSummary = {
  usable_area_m2: number;
  panel_count: number;
  nominal_kwp: number;
};

export function isTiltEligible(tilt_deg: number): boolean {
  return tilt_deg >= PV_ELIGIBLE_TILT_MIN_DEG && tilt_deg <= PV_ELIGIBLE_TILT_MAX_DEG;
}

export function defaultFaceEligibility(face: Pick<RoofFace, 'tilt_deg'>): boolean {
  return isTiltEligible(face.tilt_deg);
}

export function summarisePv(face: RoofFace): FacePvSummary {
  if (!face.is_pv_eligible || face.area_m2 <= 0) {
    return { usable_area_m2: 0, panel_count: 0, nominal_kwp: 0 };
  }
  const coverage = clamp(face.max_coverage_pct ?? DEFAULT_MAX_COVERAGE_PCT, 0, 100) / 100;
  const panelArea = face.panel_size_m2 || DEFAULT_PANEL_SIZE_M2;
  const usable = face.area_m2 * coverage;
  const panels = Math.max(0, Math.floor(usable / panelArea));
  const kwp = panels * panelArea * NOMINAL_KW_PER_M2;
  return {
    usable_area_m2: round2(usable),
    panel_count: panels,
    nominal_kwp: round2(kwp),
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
