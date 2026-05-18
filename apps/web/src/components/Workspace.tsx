import { useEffect, useState } from 'react';
import { useAutosave } from '../lib/autosaveBridge.js';
import { downloadProject, rememberRecent } from '../lib/persistence.js';
import { useProject } from '../store/projectStore.js';
import { toast } from '../store/toasts.js';
import { BuildingList } from './BuildingList.js';
import { ErrorBoundary } from './ErrorBoundary.js';
import { InspectorPanel } from './InspectorPanel.js';
import { MapView } from './MapView.js';
import { Toolbar } from './Toolbar.js';

type SidePanelTab = 'buildings' | 'inspector';

export function Workspace(): JSX.Element {
  useAutosave();
  const project = useProject((s) => s.project);
  const markSaved = useProject((s) => s.markSaved);
  const undo = useProject((s) => s.undo);
  const redo = useProject((s) => s.redo);
  const select = useProject((s) => s.select);
  const selection = useProject((s) => s.selection);

  // Side panel tabs — auto-switch to Inspector when a building / face is
  // selected, and back to Buildings on deselect, so the user doesn't have
  // to keep scrolling between the two lists.
  const [tab, setTab] = useState<SidePanelTab>('buildings');
  useEffect(() => {
    if (selection.kind === 'building' || selection.kind === 'face') setTab('inspector');
    else setTab('buildings');
  }, [selection.kind, 'buildingId' in selection ? selection.buildingId : null]);

  // Global keyboard shortcuts.
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      const target = e.target as HTMLElement | null;
      const editing =
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (editing) return;

      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (project) {
          downloadProject(project);
          rememberRecent(project);
          markSaved();
          toast.info('Project downloaded.');
        }
        return;
      }
      if (ctrl && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (e.key === 'Escape') {
        select({ kind: 'none' });
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [project, markSaved, undo, redo, select]);

  return (
    <div className="main">
      <ErrorBoundary label="Map">
        <MapView />
      </ErrorBoundary>
      <div className="map-overlays">
        <Toolbar />
        <div className="side-panel">
          <div className="side-panel-tabs" role="tablist" aria-label="Side panel">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'buildings'}
              className={`side-panel-tab ${tab === 'buildings' ? 'active' : ''}`}
              onClick={() => setTab('buildings')}
            >
              Buildings
              {project?.buildings.length ? (
                <span className="tab-count">{project.buildings.length}</span>
              ) : null}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'inspector'}
              className={`side-panel-tab ${tab === 'inspector' ? 'active' : ''}`}
              onClick={() => setTab('inspector')}
              disabled={selection.kind === 'none'}
              title={selection.kind === 'none' ? 'Select a building to inspect' : 'Inspector'}
            >
              Inspector
            </button>
          </div>
          {tab === 'buildings' ? (
            <section className="section" style={{ flex: 1, overflowY: 'auto' }}>
              <BuildingList />
            </section>
          ) : (
            <section className="section" style={{ flex: 1, overflowY: 'auto' }}>
              <ErrorBoundary label="Inspector">
                <InspectorPanel />
              </ErrorBoundary>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
