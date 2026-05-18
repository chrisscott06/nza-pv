import { summariseFaces } from '@nza-pv/shared';
import { useState } from 'react';
import { flyToBuilding } from '../lib/drawing/mapBridge.js';
import { useProject } from '../store/projectStore.js';

export function BuildingList(): JSX.Element {
  const buildings = useProject((s) => s.project?.buildings ?? []);
  const selection = useProject((s) => s.selection);
  const select = useProject((s) => s.select);
  const renameBuilding = useProject((s) => s.renameBuilding);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  if (buildings.length === 0) {
    return <div className="empty">No buildings yet — pick a tool and start drawing.</div>;
  }

  return (
    <div className="building-list">
      {buildings.map((b) => {
        const selected =
          (selection.kind === 'building' || selection.kind === 'face') &&
          selection.buildingId === b.id;
        return (
          <div
            key={b.id}
            className={`building-row ${selected ? 'selected' : ''}`}
            onClick={() => {
              select({ kind: 'building', buildingId: b.id });
              flyToBuilding(b);
            }}
          >
            <div>
              {editingId === b.id ? (
                <input
                  className="name-input"
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onBlur={() => {
                    if (draft.trim()) renameBuilding(b.id, draft.trim());
                    setEditingId(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="name-input"
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setDraft(b.name);
                    setEditingId(b.id);
                  }}
                >
                  {b.name}
                </button>
              )}
              <div className="meta">
                {b.eave_height_m.toFixed(1)} m · {b.roof.style}
              </div>
              {b.faces.length > 0 ? <BuildingPvLine faces={b.faces} /> : null}
            </div>
            <div className="meta tabular">{b.faces.length || '—'}</div>
          </div>
        );
      })}
    </div>
  );
}

function BuildingPvLine({
  faces,
}: { faces: Parameters<typeof summariseFaces>[0] }): JSX.Element | null {
  const pv = summariseFaces(faces);
  if (pv.nominal_kwp <= 0) return null;
  return (
    <div className="meta" style={{ fontSize: 11 }}>
      {pv.nominal_kwp.toFixed(1)} kWp · {pv.annual_kwh.toLocaleString()} kWh/yr
    </div>
  );
}
