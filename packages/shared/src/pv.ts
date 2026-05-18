// Phase-1 PV calculator — geometry-based nominal kWp + a simple annual
// kWh estimate. Real PVGIS-driven generation lands in Phase 5; until
// then we use a UK-southern baseline yield with tilt and azimuth
// correction factors, accurate to roughly ±10% for pre-feasibility.

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

/** Annual specific yield for a south-facing array at the optimum tilt in
 *  the UK midlands / south (PVGIS typical for Bristol-ish: ~950 kWh/kWp).
 *  Tilt and azimuth correction factors taper down from here. */
export const BASE_ANNUAL_YIELD_KWH_PER_KWP = 950;

/** Tilt that maximises annual yield in the UK (~35° south-facing). */
const OPTIMAL_TILT_DEG = 35;

export type FacePvSummary = {
  usable_area_m2: number;
  panel_count: number;
  nominal_kwp: number;
  /** Estimated annual generation in kWh. Computed as kWp × baseline ×
   *  tiltFactor × azimuthFactor — a defensible placeholder until PVGIS. */
  annual_kwh: number;
};

export function isTiltEligible(tilt_deg: number): boolean {
  return tilt_deg >= PV_ELIGIBLE_TILT_MIN_DEG && tilt_deg <= PV_ELIGIBLE_TILT_MAX_DEG;
}

export function defaultFaceEligibility(face: Pick<RoofFace, 'tilt_deg'>): boolean {
  return isTiltEligible(face.tilt_deg);
}

/** Yield correction for tilt — peaks at OPTIMAL_TILT_DEG, drops linearly
 *  about 0.5% per degree away (gentle taper that ends at ~0.825 at
 *  flat 0° and ~0.85 at 65°). Clamped at 0.7 so even bad tilts don't
 *  collapse to zero. */
export function tiltFactor(tilt_deg: number): number {
  const delta = Math.abs(tilt_deg - OPTIMAL_TILT_DEG);
  return Math.max(0.7, 1 - delta * 0.005);
}

/** Yield correction for azimuth — cosine around south (180°), bounded
 *  to [0.55, 1.0]. South 1.0; E / W ~0.78; N ~0.55. */
export function azimuthFactor(azimuth_deg: number): number {
  // azimuth_deg uses 0 = north, clockwise. Distance from due south (180°)
  // folded to [0, 180].
  const delta = Math.abs(((azimuth_deg - 180 + 540) % 360) - 180);
  // Re-map cos(delta) ∈ [-1, 1] to [0.55, 1.0] so the worst case
  // (north-facing) still keeps roughly half-yield rather than going
  // negative — a real north-facing UK array generates a bit, just
  // poorly.
  const cos = Math.cos((delta * Math.PI) / 180);
  return Math.max(0.55, 0.55 + 0.45 * ((cos + 1) / 2));
}

export function summarisePv(face: RoofFace): FacePvSummary {
  if (!face.is_pv_eligible || face.area_m2 <= 0) {
    return { usable_area_m2: 0, panel_count: 0, nominal_kwp: 0, annual_kwh: 0 };
  }
  const coverage = clamp(face.max_coverage_pct ?? DEFAULT_MAX_COVERAGE_PCT, 0, 100) / 100;
  const panelArea = face.panel_size_m2 || DEFAULT_PANEL_SIZE_M2;
  const usable = face.area_m2 * coverage;
  const panels = Math.max(0, Math.floor(usable / panelArea));
  const kwp = panels * panelArea * NOMINAL_KW_PER_M2;
  const tFactor =
    face.cardinal === 'flat' ? tiltFactor(OPTIMAL_TILT_DEG) : tiltFactor(face.tilt_deg);
  const aFactor = face.cardinal === 'flat' ? 1 : azimuthFactor(face.azimuth_deg);
  const annual = kwp * BASE_ANNUAL_YIELD_KWH_PER_KWP * tFactor * aFactor;
  return {
    usable_area_m2: round2(usable),
    panel_count: panels,
    nominal_kwp: round2(kwp),
    annual_kwh: Math.round(annual),
  };
}

/** Aggregate per-face PV figures across a list of faces. */
export function summariseFaces(faces: RoofFace[]): FacePvSummary {
  const acc: FacePvSummary = {
    usable_area_m2: 0,
    panel_count: 0,
    nominal_kwp: 0,
    annual_kwh: 0,
  };
  for (const f of faces) {
    const s = summarisePv(f);
    acc.usable_area_m2 += s.usable_area_m2;
    acc.panel_count += s.panel_count;
    acc.nominal_kwp += s.nominal_kwp;
    acc.annual_kwh += s.annual_kwh;
  }
  acc.usable_area_m2 = round2(acc.usable_area_m2);
  acc.nominal_kwp = round2(acc.nominal_kwp);
  return acc;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
