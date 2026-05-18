// Roof builder UI — preset gallery + style-specific controls.
// Placeholder shown when no calc engine is wired up; on Day 5+ we replace
// the preset action with a real calc-engine call.

import { type Building, ROOF_STYLES, type Roof, type RoofStyle } from '@nza-pv/shared';
import { pickAxisForBearing } from '../lib/roof/generators.js';
import { defaultRoofForStyle, presetLabel, presetThumbnail } from '../lib/roof/presets.js';
import {
  buildingOBBRotation,
  mathAngleToRidgeBearing,
  regenerateFaces,
} from '../lib/roof/regenerate.js';
import { useProject } from '../store/projectStore.js';

export function RoofBuilder({ building }: { building: Building }): JSX.Element {
  const setRoof = useProject((s) => s.setRoof);
  const setFaces = useProject((s) => s.setFaces);

  function pick(style: RoofStyle): void {
    // Snapshot the building's current OBB long-axis bearing so the new roof
    // ridge is anchored to the same world direction the long axis happened
    // to point in at apply time. From then on rotating the building won't
    // swing the ridge with it — it'll stay put in world coords, the same
    // way mono's `high_side` already does. Without this snapshot the ridge
    // would fall back to the OBB-relative 'longest' default and spin with
    // the building.
    const bearing = mathAngleToRidgeBearing(buildingOBBRotation(building));
    const roof = withBearing(defaultRoofForStyle(style, building.roof), bearing);
    setRoof(building.id, roof);
    const faces = regenerateFaces({ ...building, roof });
    setFaces(building.id, faces);
  }

  function updateRoof(roof: Roof): void {
    setRoof(building.id, roof);
    const faces = regenerateFaces({ ...building, roof });
    setFaces(building.id, faces);
  }

  return (
    <div style={{ marginTop: 14 }}>
      <h4 className="section-title" style={{ margin: '4px 0 8px' }}>
        Roof preset
      </h4>
      <div className="preset-gallery">
        {ROOF_STYLES.map((s) => (
          <button
            key={s}
            type="button"
            className={`preset-tile ${building.roof.style === s ? 'active' : ''}`}
            onClick={() => pick(s)}
            title={presetLabel(s)}
          >
            <span dangerouslySetInnerHTML={{ __html: presetThumbnail(s) }} />
            <span className="tile-name">{presetLabel(s)}</span>
          </button>
        ))}
      </div>
      <div style={{ marginTop: 10 }}>
        <RoofParams roof={building.roof} onChange={updateRoof} building={building} />
      </div>
    </div>
  );
}

/** Stamp `ridge_bearing_deg` onto any rotation-aware roof. The schema marks
 *  it as optional on every variant that supports it, so a structural test
 *  via `style` is enough to know whether to write it. Spread-back keeps the
 *  rest of the roof type-safe. */
function withBearing(roof: Roof, bearing: number): Roof {
  switch (roof.style) {
    case 'gable':
    case 'hip':
    case 'dutch_hip':
    case 'gambrel':
    case 'mansard':
    case 'saltbox':
    case 'sawtooth':
    case 'butterfly':
    case 'parallel_gables':
      return { ...roof, ridge_bearing_deg: bearing };
    default:
      return roof;
  }
}

function RoofParams({
  roof,
  onChange,
  building,
}: {
  roof: Roof;
  onChange: (r: Roof) => void;
  building: Building;
}): JSX.Element {
  switch (roof.style) {
    case 'flat':
      return (
        <RangeRow
          label="Parapet"
          unit="m"
          min={0}
          max={1.5}
          step={0.05}
          value={roof.parapet_height_m}
          onChange={(v) => onChange({ ...roof, parapet_height_m: v })}
        />
      );
    case 'mono':
      return (
        <>
          <PitchSlider
            value={roof.pitch_deg}
            onChange={(v) => onChange({ ...roof, pitch_deg: v })}
          />
          <RotateOrientationRow roof={roof} onChange={onChange} building={building} />
        </>
      );
    case 'gable':
    case 'hip':
    case 'dutch_hip':
    case 'pyramid':
    case 'cross_gabled':
    case 'butterfly':
      return (
        <>
          <PitchSlider
            value={(roof as { pitch_deg: number }).pitch_deg}
            onChange={(v) => onChange({ ...roof, pitch_deg: v } as Roof)}
          />
          <RotateOrientationRow roof={roof} onChange={onChange} building={building} />
          {'hip_ratio' in roof && (
            <RangeRow
              label="Hip ratio"
              min={0.1}
              max={0.5}
              step={0.05}
              value={roof.hip_ratio}
              onChange={(v) => onChange({ ...roof, hip_ratio: v })}
            />
          )}
          {'valley_depth_m' in roof && (
            <RangeRow
              label="Valley depth"
              unit="m"
              min={0.2}
              max={3}
              step={0.1}
              value={roof.valley_depth_m}
              onChange={(v) => onChange({ ...roof, valley_depth_m: v })}
            />
          )}
        </>
      );
    case 'gambrel':
    case 'mansard':
      return (
        <>
          <PitchSlider
            label="Lower pitch"
            value={roof.lower_pitch_deg}
            onChange={(v) => onChange({ ...roof, lower_pitch_deg: v })}
          />
          <PitchSlider
            label="Upper pitch"
            value={roof.upper_pitch_deg}
            onChange={(v) => onChange({ ...roof, upper_pitch_deg: v })}
          />
          <RangeRow
            label="Break height"
            unit="m"
            min={0.5}
            max={6}
            step={0.1}
            value={roof.break_height_m}
            onChange={(v) => onChange({ ...roof, break_height_m: v })}
          />
          <RotateOrientationRow roof={roof} onChange={onChange} building={building} />
        </>
      );
    case 'saltbox':
      return (
        <>
          <PitchSlider
            label="Front pitch"
            value={roof.front_pitch_deg}
            onChange={(v) => onChange({ ...roof, front_pitch_deg: v })}
          />
          <PitchSlider
            label="Back pitch"
            value={roof.back_pitch_deg}
            onChange={(v) => onChange({ ...roof, back_pitch_deg: v })}
          />
          <RangeRow
            label="Ridge offset"
            unit="%"
            min={-40}
            max={40}
            step={1}
            value={roof.ridge_offset_pct}
            onChange={(v) => onChange({ ...roof, ridge_offset_pct: v })}
          />
          <RotateOrientationRow roof={roof} onChange={onChange} building={building} />
        </>
      );
    case 'sawtooth':
      return (
        <>
          <PitchSlider
            value={roof.pitch_deg}
            onChange={(v) => onChange({ ...roof, pitch_deg: v })}
          />
          <RangeRow
            label="Pitches"
            min={2}
            max={8}
            step={1}
            value={roof.pitch_count}
            onChange={(v) => onChange({ ...roof, pitch_count: Math.round(v) })}
          />
          <RangeRow
            label="Glazing width"
            unit="m"
            min={0.3}
            max={3}
            step={0.1}
            value={roof.glazing_strip_width_m}
            onChange={(v) => onChange({ ...roof, glazing_strip_width_m: v })}
          />
          <RotateOrientationRow roof={roof} onChange={onChange} building={building} />
        </>
      );
    case 'parallel_gables':
      return (
        <>
          <PitchSlider
            value={roof.pitch_deg}
            onChange={(v) => onChange({ ...roof, pitch_deg: v })}
          />
          <RangeRow
            label="Bays"
            min={2}
            max={8}
            step={1}
            value={roof.pitch_count}
            onChange={(v) => onChange({ ...roof, pitch_count: Math.round(v) })}
          />
          <RotateOrientationRow roof={roof} onChange={onChange} building={building} />
        </>
      );
    default:
      return <></>;
  }
}

function PitchSlider({
  value,
  onChange,
  label = 'Pitch',
}: { value: number; onChange: (v: number) => void; label?: string }): JSX.Element {
  return (
    <RangeRow label={label} unit="°" min={0} max={60} step={1} value={value} onChange={onChange} />
  );
}

function RangeRow({
  label,
  unit = '',
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  unit?: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}): JSX.Element {
  return (
    <div className="field-row">
      <label>{label}</label>
      <div className="range-row">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <span className="tabular">
          {value}
          {unit}
        </span>
      </div>
    </div>
  );
}

/** "Rotate 90°" button for the ridge / slope direction.
 *
 *  Every rotation-aware roof (gable, hip, dutch_hip, gambrel, mansard,
 *  saltbox, sawtooth, butterfly, parallel_gables) stores `ridge_bearing_deg`
 *  — a WORLD bearing (degrees from north, [0, 180)). The generator snaps to
 *  whichever OBB axis is currently closer to that bearing each time it
 *  regenerates, so the ridge stays put in the user's view even as they
 *  rotate or stretch the building. Mono uses the same idea via `high_side`.
 *
 *  The button flips the bearing by 90°. If the bearing hasn't been stamped
 *  yet (e.g., a project saved before this field existed), we snapshot the
 *  current OBB long-axis bearing first so the click does what the user
 *  expects — flip *from the current visible orientation* — rather than from
 *  an arbitrary default. */
function RotateOrientationRow({
  roof,
  onChange,
  building,
}: {
  roof: Roof;
  onChange: (r: Roof) => void;
  building: Building;
}): JSX.Element | null {
  if (roof.style === 'mono') {
    const seq: Array<'N' | 'E' | 'S' | 'W'> = ['N', 'E', 'S', 'W'];
    const currentLabel =
      typeof roof.high_side === 'number'
        ? `${Math.round(roof.high_side)}°`
        : `High side ${roof.high_side}`;
    return (
      <ButtonRow
        label="Orientation"
        hint={currentLabel}
        cta="Rotate 90°"
        onClick={() => {
          if (typeof roof.high_side === 'number') {
            onChange({ ...roof, high_side: (roof.high_side + 90) % 360 });
            return;
          }
          const idx = seq.indexOf(roof.high_side as 'N' | 'E' | 'S' | 'W');
          const next = seq[(idx + 1) % 4]!;
          onChange({ ...roof, high_side: next });
        }}
      />
    );
  }
  if (!isRotationAware(roof)) return null;
  const boxRotation = buildingOBBRotation(building);
  const currentBearing =
    typeof (roof as { ridge_bearing_deg?: number }).ridge_bearing_deg === 'number'
      ? ((roof as { ridge_bearing_deg: number }).ridge_bearing_deg as number)
      : effectiveBearingFromLegacyFields(roof, boxRotation);
  const nextBearing = (currentBearing + 90) % 180;
  const axis = pickAxisForBearing(currentBearing, boxRotation);
  return (
    <ButtonRow
      label="Orientation"
      hint={`Ridge ${formatBearing(currentBearing)} · along ${axis === 'longest' ? 'long' : 'short'} edge`}
      cta="Rotate 90°"
      onClick={() => onChange({ ...roof, ridge_bearing_deg: nextBearing } as Roof)}
    />
  );
}

function isRotationAware(roof: Roof): boolean {
  switch (roof.style) {
    case 'gable':
    case 'hip':
    case 'dutch_hip':
    case 'gambrel':
    case 'mansard':
    case 'saltbox':
    case 'sawtooth':
    case 'butterfly':
    case 'parallel_gables':
      return true;
    default:
      return false;
  }
}

/** Recover the world bearing implied by a roof that pre-dates
 *  `ridge_bearing_deg` and only carries the OBB-relative `ridge_axis` or
 *  `orientation` enum. */
function effectiveBearingFromLegacyFields(roof: Roof, boxRotation: number): number {
  const isShort =
    ('ridge_axis' in roof && roof.ridge_axis === 'shortest') ||
    ('orientation' in roof && roof.orientation === 'shortest');
  const axisAngleRad = isShort ? boxRotation + Math.PI / 2 : boxRotation;
  return mathAngleToRidgeBearing(axisAngleRad);
}

function formatBearing(bearingDeg: number): string {
  const b = ((bearingDeg % 180) + 180) % 180;
  // Snap labels to cardinals when close (within 5°); otherwise show degrees.
  if (b < 5 || b > 175) return 'N–S';
  if (b > 85 && b < 95) return 'E–W';
  return `${Math.round(b)}°`;
}

function ButtonRow({
  label,
  hint,
  cta,
  onClick,
}: {
  label: string;
  hint: string;
  cta: string;
  onClick: () => void;
}): JSX.Element {
  return (
    <div className="field-row">
      <label title={hint}>{label}</label>
      <button
        type="button"
        onClick={onClick}
        title={`${hint} · click to rotate`}
        style={{
          background: 'var(--c-panel-2)',
          border: '1px solid var(--c-border)',
          borderRadius: 4,
          padding: '4px 8px',
          fontSize: 12,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        <span style={{ fontSize: 14 }} aria-hidden>
          ↻
        </span>
        {cta}
      </button>
    </div>
  );
}
