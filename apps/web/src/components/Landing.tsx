import { useState } from 'react';
import { loadAutosave, loadRecents, pickProjectFromDisk } from '../lib/persistence.js';
import { useProject } from '../store/projectStore.js';
import { toast } from '../store/toasts.js';

export function Landing(): JSX.Element {
  const newProject = useProject((s) => s.newProject);
  const loadProject = useProject((s) => s.loadProject);
  const [name, setName] = useState('Hartpury Demo');
  const recents = loadRecents();
  const autosave = loadAutosave();

  async function handleOpen(): Promise<void> {
    try {
      const file = await pickProjectFromDisk();
      if (file) {
        loadProject(file);
        toast.info(`Opened "${file.project.name}".`);
      }
    } catch (err) {
      toast.error(`Open failed: ${(err as Error).message}`);
    }
  }

  return (
    <div className="landing">
      <div className="landing-card">
        <h1>NZA-PV</h1>
        <p className="tagline">A 3D building &amp; roof workbench for PV pre-feasibility.</p>

        <div className="actions">
          <div className="field">
            <label htmlFor="new-project-name">New project</label>
            <input
              id="new-project-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') newProject(name);
              }}
            />
          </div>
          <button type="button" className="primary" onClick={() => newProject(name)}>
            Create project
          </button>

          <div className="divider" />

          <button type="button" className="secondary" onClick={handleOpen}>
            Open .nzapv file…
          </button>

          {autosave && (
            <button
              type="button"
              className="secondary"
              onClick={() => loadProject(autosave)}
              title={`Last edited ${new Date(autosave.project.last_modified).toLocaleString()}`}
            >
              Resume autosave: {autosave.project.name}
            </button>
          )}

          {recents.length > 0 && (
            <>
              <div className="divider" />
              <label>Recently saved</label>
              <div className="recents">
                {recents.map((r) => (
                  <div key={r.id} className="row" onClick={handleOpen} title="Re-open the .nzapv file">
                    <span className="name">{r.name}</span>
                    <span className="when">{new Date(r.last_modified).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
