// Inspector panel — contextual on the current selection. Building info on Day 1,
// roof builder (Days 5–6) and face inspector (Day 7) wired in here.

import { PANEL_PRESETS, summarisePv } from '@nza-pv/shared';
import { selectActiveBuilding, selectActiveFace, useProject } from '../store/projectStore.js';
import { BulkOpsPanel } from './BulkOpsPanel.js';
import { RoofBuilder } from './RoofBuilder.js';

export function InspectorPanel(): JSX.Element {
  const selection = useProject((s) => s.selection);
  const building = useProject(selectActiveBuilding);
  const faceSel = useProject(selectActiveFace);
  const setBuildingHeight = useProject((s) => s.setBuildingHeight);
  const removeBuilding = useProject((s) => s.removeBuilding);
  const toggleFaceEligibility = useProject((s) => s.toggleFaceEligibility);
  const setFaceCoverage = useProject((s) => s.setFaceCoverage);
  const setFacePanelSize = useProject((s) => s.setFacePanelSize);
  const resetFaceOverrides = useProject((s) => s.resetFaceOverrides);

  if (selection.kind === 'none' || !building) {
    return (
      <div className="empty">
        Click a building on the map or in the list to inspect it. Click a roof face for face-level
        controls.
      </div>
    );
  }

  if (faceSel && faceSel.buildingId === building.id) {
    const { face } = faceSel;
    const pv = summarisePv(face);
    return (
      <div>
        <div style={{ marginBottom: 8, fontSize: 13 }}>
          <strong>
            {cardinalLabel(face.cardinal)} {roleLabel(face.role)}
          </strong>
          <div className="muted" style={{ fontSize: 12 }}>
            on {building.name}
          </div>
        </div>
        <ReadOnlyRow label="Area" value={`${face.area_m2.toFixed(1)} m²`} />
        <ReadOnlyRow label="Tilt" value={`${face.tilt_deg.toFixed(1)}°`} />
        <ReadOnlyRow
          label="Azimuth"
          value={`${face.azimuth_deg.toFixed(0)}° ${face.cardinal === 'flat' ? '' : face.cardinal}`}
        />

        <div className="field-row" style={{ marginTop: 12 }}>
          <label>PV eligible</label>
          <input
            type="checkbox"
            checked={face.is_pv_eligible}
            onChange={() => toggleFaceEligibility(building.id, face.id)}
          />
        </div>
        <div className="field-row">
          <label>Max coverage</label>
          <div className="range-row">
            <input
              type="range"
              min={10}
              max={95}
              value={face.max_coverage_pct}
              onChange={(e) => setFaceCoverage(building.id, face.id, Number(e.target.value))}
            />
            <span className="tabular">{face.max_coverage_pct}%</span>
          </div>
        </div>
        <div className="field-row">
          <label>Panel size</label>
          <select
            value={face.panel_size_m2}
            onChange={(e) => setFacePanelSize(building.id, face.id, Number(e.target.value))}
          >
            {PANEL_PRESETS.map((p) => (
              <option key={p.m2} value={p.m2}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        <hr style={{ borderColor: 'var(--c-border)', margin: '12px 0' }} />
        <ReadOnlyRow label="Usable area" value={`${pv.usable_area_m2} m²`} />
        <ReadOnlyRow label="Panel count" value={`${pv.panel_count}`} />
        <ReadOnlyRow label="Nominal" value={`${pv.nominal_kwp} kWp`} />

        <button
          type="button"
          style={{ marginTop: 12, fontSize: 12, color: 'var(--c-text-dim)' }}
          onClick={() => resetFaceOverrides(building.id, face.id)}
        >
          Reset face to defaults
        </button>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 8 }}>
        <strong>{building.name}</strong>
      </div>
      <div className="field-row">
        <label>Storeys</label>
        <input
          type="number"
          min={1}
          max={20}
          value={building.storeys}
          onChange={(e) =>
            setBuildingHeight(building.id, { storeys: Math.max(1, Number(e.target.value)) })
          }
        />
      </div>
      <div className="field-row">
        <label>Storey height (m)</label>
        <input
          type="number"
          step={0.1}
          min={2}
          max={6}
          value={building.storey_height_m}
          onChange={(e) =>
            setBuildingHeight(building.id, { storey_height_m: Number(e.target.value) })
          }
        />
      </div>
      <div className="field-row">
        <label>Eave height (m)</label>
        <input
          type="number"
          step={0.1}
          min={2}
          value={building.eave_height_m}
          onChange={(e) =>
            setBuildingHeight(building.id, { eave_height_m: Number(e.target.value) })
          }
        />
      </div>

      <RoofBuilder building={building} />

      <BulkOpsPanel buildingId={building.id} />

      <button
        type="button"
        style={{
          marginTop: 14,
          color: 'var(--c-danger)',
          fontSize: 12,
        }}
        onClick={() => {
          if (confirm(`Delete ${building.name}?`)) removeBuilding(building.id);
        }}
      >
        Delete building
      </button>
    </div>
  );
}

function ReadOnlyRow({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="field-row">
      <label>{label}</label>
      <div className="tabular" style={{ textAlign: 'right' }}>
        {value}
      </div>
    </div>
  );
}

function cardinalLabel(c: string): string {
  return c === 'flat' ? 'Flat' : `${c}-facing`;
}

function roleLabel(r: string): string {
  return r.replaceAll('_', ' ');
}
