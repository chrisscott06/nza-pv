import { useProject, type WorkspaceView } from '../store/projectStore.js';

type Step = {
  id: string;
  label: string;
  glyph: string;
  // 'view:<v>' switches workspaceView; 'soon' is a Phase 2+ placeholder.
  action: { kind: 'view'; view: WorkspaceView } | { kind: 'soon' };
};

const STEPS: Step[] = [
  { id: 'buildings', label: 'Buildings', glyph: '🏠', action: { kind: 'view', view: 'buildings' } },
  { id: 'roofs', label: 'Roofs', glyph: '⛰', action: { kind: 'soon' } },
  { id: 'pv', label: 'PV', glyph: '⚡', action: { kind: 'view', view: 'pv' } },
  { id: 'report', label: 'Report', glyph: '📄', action: { kind: 'soon' } },
];

export function LeftRail(): JSX.Element {
  const workspaceView = useProject((s) => s.workspaceView);
  const setWorkspaceView = useProject((s) => s.setWorkspaceView);
  return (
    <nav className="left-rail" aria-label="Workflow steps">
      {STEPS.map((s) => {
        const interactive = s.action.kind === 'view';
        const active = s.action.kind === 'view' && workspaceView === s.action.view;
        return (
          <button
            type="button"
            key={s.id}
            className={`step ${active ? 'active' : ''} ${interactive ? '' : 'soon'}`}
            disabled={!interactive}
            title={interactive ? s.label : `${s.label} — coming in a later phase`}
            onClick={
              s.action.kind === 'view'
                ? () => setWorkspaceView((s.action as { kind: 'view'; view: WorkspaceView }).view)
                : undefined
            }
          >
            <span className="glyph" aria-hidden>
              {s.glyph}
            </span>
            {s.label}
          </button>
        );
      })}
    </nav>
  );
}
