import { useEffect } from 'react';
import { useAutosave } from '../lib/autosaveBridge.js';
import { downloadProject, rememberRecent } from '../lib/persistence.js';
import { useProject } from '../store/projectStore.js';
import { toast } from '../store/toasts.js';
import { BuildingList } from './BuildingList.js';
import { InspectorPanel } from './InspectorPanel.js';
import { MapView } from './MapView.js';
import { SceneView } from './SceneView.js';
import { Toolbar } from './Toolbar.js';

export function Workspace(): JSX.Element {
  useAutosave();
  const view = useProject((s) => s.view);
  const project = useProject((s) => s.project);
  const markSaved = useProject((s) => s.markSaved);
  const undo = useProject((s) => s.undo);
  const redo = useProject((s) => s.redo);
  const select = useProject((s) => s.select);

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
      {view === '3d' ? <SceneView /> : <MapView />}
      <div className="map-overlays">
        <Toolbar />
        <div className="side-panel">
          <section className="section">
            <h3 className="section-title">Buildings</h3>
            <BuildingList />
          </section>
          <section className="section" style={{ flex: 1, overflowY: 'auto' }}>
            <h3 className="section-title">Inspector</h3>
            <InspectorPanel />
          </section>
        </div>
      </div>
    </div>
  );
}
