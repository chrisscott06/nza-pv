// Inspector panel — contextual on the current selection.

import { PANEL_PRESETS, type RoofFace, summarisePv, summariseFaces } from '@nza-pv/shared';
import { useState } from 'react';
import { useShallow } from 'zustand/shallow';
import { regenerateFaces } from '../lib/roof/regenerate.js';
import { selectActiveBuilding, selectActiveFace, useProject } from '../store/projectStore.js';
import { BulkOpsPanel } from './BulkOpsPanel.js';
import { RoofBuilder } from './RoofBuilder.js';

export function InspectorPanel(): JSX.Element {
  const selection = useProject((s) => s.selection);
  const building = useProject(selectActiveBuilding);
  // `selectActiveFace` returns a fresh `{ face, buildingId }` object on every
  // call, which trips Zustand v5's snapshot stability check and triggers an
  // infinite re-render loop. Wrapping with `useShallow` compares the object's
  // contents instead of its identity so the snapshot is stable when face/id
  // haven't changed.
  const faceSel = useProject(useShallow(selectActiveFace));
  const setBuildingHeight = useProject((s) => s.setBuildingHeight);
  const setFaces = useProject((s) => s.setFaces);
  const renameBuilding = useProject((s) => s.renameBuilding);
  const removeBuilding = useProject((s) => s.removeBuilding);
  const select = useProject((s) => s.select);
  const toggleFaceEligibility = useProject((s) => s.toggleFaceEligibility);
  const setFaceCoverage = useProject((s) => s.setFaceCoverage);
  const setFacePanelSize = useProject((s) => s.setFacePanelSize);
  const resetFaceOverrides = useProject((s) => s.resetFaceOverrides);

  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState('');

  if (selection.kind === 'none' || !building) {
    return (
      <div className="empty">
        Click a building on the map or in the list to inspect it. Click a roof face for face-level
        controls.
      </div>
    );
  }

  // Whenever the height or storey count changes, the roof must follow the new
  // top-of-wall — so regen the faces with the updated eave.
  function applyHeight(opts: Parameters<typeof setBuildingHeight>[1]): void {
    if (!building) return;
    setBuildingHeight(building.id, opts);
    const refreshed = useProject.getState().project?.buildings.find((b) => b.id === building.id);
    if (refreshed) setFaces(building.id, regenerateFaces(refreshed));
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
        <ReadOnlyRow label="Est. annual" value={`${pv.annual_kwh.toLocaleString()} kWh`} />

        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button
            type="button"
            style={{ fontSize: 12, color: 'var(--c-text-dim)' }}
            onClick={() => resetFaceOverrides(building.id, face.id)}
          >
            Reset face
          </button>
          <button
            type="button"
            style={{ fontSize: 12, color: 'var(--c-text-dim)', marginLeft: 'auto' }}
            onClick={() => select({ kind: 'building', buildingId: building.id })}
            title="Back to building-level controls"
          >
            ← Back to building
          </button>
        </div>
      </div>
    );
  }

  function startRename(): void {
    if (!building) return;
    setDraftName(building.name);
    setRenaming(true);
  }

  function commitRename(): void {
    if (!building) return;
    const v = draftName.trim();
    if (v && v !== building.name) renameBuilding(building.id, v);
    setRenaming(false);
  }

  return (
    <div>
      {/* Title row with discoverable rename + Done */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        {renaming ? (
          <input
            autoFocus
            className="name-input"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') setRenaming(false);
            }}
            style={{
              fontSize: 14,
              fontWeight: 600,
              flex: 1,
              background: 'var(--c-panel-2)',
              border: '1px solid var(--c-accent)',
              borderRadius: 4,
              padding: '4px 6px',
              color: 'var(--c-text)',
            }}
          />
        ) : (
          <>
            <strong style={{ flex: 1 }}>{building.name}</strong>
            <button
              type="button"
              onClick={startRename}
              title="Rename building"
              style={{
                padding: '2px 6px',
                border: '1px solid var(--c-border)',
                borderRadius: 4,
                fontSize: 11,
                color: 'var(--c-text-dim)',
              }}
            >
              Rename
            </button>
          </>
        )}
        <button
          type="button"
          onClick={() => select({ kind: 'none' })}
          title="Finish editing this building (Esc)"
          style={{
            padding: '2px 8px',
            border: '1px solid var(--c-accent-deep)',
            background: 'var(--c-accent-deep)',
            color: '#fff',
            borderRadius: 4,
            fontSize: 11,
          }}
        >
          Done
        </button>
      </div>

      <div className="field-row">
        <label>Storeys</label>
        <input
          type="number"
          min={1}
          max={20}
          value={building.storeys}
          onChange={(e) => applyHeight({ storeys: Math.max(1, Number(e.target.value)) })}
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
          onChange={(e) => applyHeight({ storey_height_m: Number(e.target.value) })}
        />
      </div>
      <div className="field-row">
        <label>Eave height (m)</label>
        <input
          type="number"
          step={0.1}
          min={2}
          value={building.eave_height_m}
          onChange={(e) => applyHeight({ eave_height_m: Number(e.target.value) })}
        />
      </div>

      <RoofBuilder building={building} />

      <FacesList
        faces={building.faces}
        onToggleEligible={(faceId) => toggleFaceEligibility(building.id, faceId)}
        onPick={(faceId) => select({ kind: 'face', buildingId: building.id, faceId })}
      />

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

/** Per-face table for the building Inspector — one row per roof face with
 *  area m², tilt, PV-eligible toggle, and the face's nominal kWp. Clicking
 *  a row drills into the per-face Inspector. Toggling the checkbox flips
 *  the face in / out of PV instantly and the building rollup updates. */
function FacesList({
  faces,
  onToggleEligible,
  onPick,
}: {
  faces: RoofFace[];
  onToggleEligible: (faceId: string) => void;
  onPick: (faceId: string) => void;
}): JSX.Element | null {
  if (faces.length === 0) return null;
  // Walls / vertical end-walls have tilt ≈ 90° and aren't useful in this
  // table (you can't put PV on a vertical wall in our model). Hide them
  // so the table only shows sloped or flat roof faces.
  const rows = faces.filter((f) => f.tilt_deg < 85);
  if (rows.length === 0) return null;
  return (
    <div style={{ marginTop: 14 }}>
      <h4 className="section-title" style={{ margin: '4px 0 6px' }}>
        Roof faces
      </h4>
      <div className="muted" style={{ fontSize: 11, marginBottom: 6 }}>
        Tick a face to include it in PV. Click the row for full controls.
      </div>
      <table className="pv-table">
        <thead>
          <tr>
            <th style={{ width: 26 }} aria-label="PV eligible" />
            <th style={{ textAlign: 'left' }}>Face</th>
            <th style={{ textAlign: 'right' }}>m²</th>
            <th style={{ textAlign: 'right' }}>Tilt</th>
            <th style={{ textAlign: 'right' }}>kWp</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((f) => {
            const pv = summarisePv(f);
            return (
              <tr
                key={f.id}
                onClick={() => onPick(f.id)}
                style={{ cursor: 'pointer' }}
                title="Open per-face controls"
              >
                <td onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={f.is_pv_eligible}
                    onChange={() => onToggleEligible(f.id)}
                    aria-label={`Toggle PV on ${cardinalLabel(f.cardinal)} face`}
                  />
                </td>
                <td>
                  {cardinalLabel(f.cardinal)} <span className="muted">{roleLabel(f.role)}</span>
                </td>
                <td className="tabular" style={{ textAlign: 'right' }}>
                  {f.area_m2.toFixed(1)}
                </td>
                <td className="tabular" style={{ textAlign: 'right' }}>
                  {f.tilt_deg.toFixed(0)}°
                </td>
                <td className="tabular" style={{ textAlign: 'right' }}>
                  {pv.nominal_kwp > 0 ? pv.nominal_kwp.toFixed(1) : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
        <FacesListTotals faces={faces} />
      </table>
    </div>
  );
}

/** Footer row summarising every face on the building so the user can see
 *  the rollup without flipping to the PV step. Wrapped in its own tfoot
 *  so changing a face's coverage / eligibility refreshes only the totals
 *  cell content, not the whole table. */
function FacesListTotals({ faces }: { faces: RoofFace[] }): JSX.Element {
  const total = summariseFaces(faces);
  return (
    <tfoot>
      <tr style={{ background: 'rgba(126, 201, 138, 0.06)' }}>
        <td />
        <td style={{ fontWeight: 600 }}>Total</td>
        <td />
        <td />
        <td className="tabular" style={{ textAlign: 'right', fontWeight: 600 }}>
          {total.nominal_kwp.toFixed(1)} kWp
        </td>
      </tr>
      <tr style={{ background: 'rgba(126, 201, 138, 0.06)' }}>
        <td />
        <td className="muted" style={{ fontSize: 11 }}>
          Annual yield
        </td>
        <td />
        <td />
        <td className="tabular muted" style={{ textAlign: 'right', fontSize: 11 }}>
          {total.annual_kwh.toLocaleString()} kWh
        </td>
      </tr>
    </tfoot>
  );
}
