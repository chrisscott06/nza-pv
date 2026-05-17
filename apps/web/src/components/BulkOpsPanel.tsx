// Bulk ops UI — exposed in the inspector when a building (or multi-selection)
// is active. Apply-to-similar / match-heights / roof-copy.

import { useMemo } from 'react';
import { findSimilar } from '../lib/bulk.js';
import { regenerateFaces } from '../lib/roof/regenerate.js';
import { useProject } from '../store/projectStore.js';
import { toast } from '../store/toasts.js';

export function BulkOpsPanel({ buildingId }: { buildingId: string }): JSX.Element | null {
  const buildings = useProject((s) => s.project?.buildings ?? []);
  const applyRoofToAll = useProject((s) => s.applyRoofToAll);
  const setFaces = useProject((s) => s.setFaces);
  const setBuildingsEaveHeight = useProject((s) => s.setBuildingsEaveHeight);
  const selection = useProject((s) => s.selection);
  const select = useProject((s) => s.select);

  const source = buildings.find((b) => b.id === buildingId);
  const similar = useMemo(
    () => (source ? findSimilar(source, buildings) : []),
    [source, buildings],
  );

  if (!source || buildings.length < 2) return null;

  function applyToSimilar(): void {
    if (similar.length === 0) {
      toast.warn('No buildings similar enough to this one.');
      return;
    }
    if (
      !confirm(
        `Apply ${source!.roof.style} roof to ${similar.length} similar building${similar.length === 1 ? '' : 's'}?`,
      )
    )
      return;
    applyRoofToAll(buildingId, similar);
    // Regenerate faces for each target.
    const all = useProject.getState().project?.buildings ?? [];
    for (const id of similar) {
      const b = all.find((x) => x.id === id);
      if (b) setFaces(id, regenerateFaces(b));
    }
    toast.info(`Applied roof to ${similar.length} building${similar.length === 1 ? '' : 's'}.`);
  }

  function matchHeights(): void {
    const targetIds = buildings.filter((b) => b.id !== buildingId).map((b) => b.id);
    if (
      !confirm(
        `Set ${targetIds.length} other building${targetIds.length === 1 ? '' : 's'} to ${source!.eave_height_m.toFixed(1)}m?`,
      )
    )
      return;
    setBuildingsEaveHeight(targetIds, source!.eave_height_m);
    // Regenerate faces for each updated building.
    const all = useProject.getState().project?.buildings ?? [];
    for (const id of targetIds) {
      const b = all.find((x) => x.id === id);
      if (b) setFaces(id, regenerateFaces(b));
    }
    toast.info(
      `Heights matched on ${targetIds.length} building${targetIds.length === 1 ? '' : 's'}.`,
    );
  }

  function selectAll(): void {
    select({ kind: 'multi', buildingIds: buildings.map((b) => b.id) });
    toast.info(`Selected all ${buildings.length} buildings.`);
  }

  return (
    <div style={{ marginTop: 14, borderTop: '1px solid var(--c-border)', paddingTop: 10 }}>
      <h4 className="section-title" style={{ margin: '4px 0 8px' }}>
        Bulk ops
      </h4>
      <button
        type="button"
        style={{
          width: '100%',
          padding: '6px 8px',
          border: '1px solid var(--c-border)',
          borderRadius: 'var(--radius)',
          marginBottom: 6,
          background: 'var(--c-panel-2)',
        }}
        onClick={applyToSimilar}
        title={`Finds buildings within ±30% area, ±20% aspect, ±15° rotation`}
      >
        Apply roof to similar ({similar.length})
      </button>
      <button
        type="button"
        style={{
          width: '100%',
          padding: '6px 8px',
          border: '1px solid var(--c-border)',
          borderRadius: 'var(--radius)',
          marginBottom: 6,
          background: 'var(--c-panel-2)',
        }}
        onClick={matchHeights}
      >
        Match heights to all
      </button>
      <button
        type="button"
        style={{
          width: '100%',
          padding: '6px 8px',
          border: '1px solid var(--c-border)',
          borderRadius: 'var(--radius)',
          background: 'var(--c-panel-2)',
        }}
        onClick={selectAll}
      >
        Select all
      </button>
      {selection.kind === 'multi' && (
        <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
          {selection.buildingIds.length} selected
        </div>
      )}
    </div>
  );
}
