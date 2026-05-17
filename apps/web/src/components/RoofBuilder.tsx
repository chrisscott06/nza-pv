// Roof builder UI — preset gallery + style-specific controls.
// Placeholder shown when no calc engine is wired up; on Day 5+ we replace
// the preset action with a real calc-engine call.

import { type Building, ROOF_STYLES, type Roof, type RoofStyle } from '@nza-pv/shared';
import { defaultRoofForStyle, presetLabel, presetThumbnail } from '../lib/roof/presets.js';
import { regenerateFaces } from '../lib/roof/regenerate.js';
import { useProject } from '../store/projectStore.js';

export function RoofBuilder({ building }: { building: Building }): JSX.Element {
  const setRoof = useProject((s) => s.setRoof);
  const setFaces = useProject((s) => s.setFaces);

  function pick(style: RoofStyle): void {
    const roof = defaultRoofForStyle(style, building.roof);
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
        <RoofParams roof={building.roof} onChange={updateRoof} />
      </div>
    </div>
  );
}

function RoofParams({ roof, onChange }: { roof: Roof; onChange: (r: Roof) => void }): JSX.Element {
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
          <SelectRow
            label="High side"
            value={String(roof.high_side)}
            options={[
              ['N', 'North'],
              ['E', 'East'],
              ['S', 'South'],
              ['W', 'West'],
            ]}
            onChange={(v) => onChange({ ...roof, high_side: v as 'N' | 'E' | 'S' | 'W' })}
          />
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
          {'ridge_axis' in roof && (
            <SelectRow
              label="Ridge axis"
              value={roof.ridge_axis}
              options={[
                ['longest', 'Longest edge'],
                ['shortest', 'Shortest edge'],
                ['custom', 'Custom angle'],
              ]}
              onChange={(v) =>
                onChange({ ...roof, ridge_axis: v as 'longest' | 'shortest' | 'custom' } as Roof)
              }
            />
          )}
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

function SelectRow({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: ReadonlyArray<readonly [string, string]>;
  onChange: (v: string) => void;
}): JSX.Element {
  return (
    <div className="field-row">
      <label>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}
