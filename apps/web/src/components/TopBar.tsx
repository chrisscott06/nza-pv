import { useEffect, useState } from 'react';
import { downloadProject, rememberRecent } from '../lib/persistence.js';
import { useProject } from '../store/projectStore.js';
import { toast } from '../store/toasts.js';

export function TopBar(): JSX.Element {
  const project = useProject((s) => s.project);
  const renameProject = useProject((s) => s.renameProject);
  const markSaved = useProject((s) => s.markSaved);
  const lastSavedAt = useProject((s) => s.lastSavedAt);
  const past = useProject((s) => s.past);
  const future = useProject((s) => s.future);
  const undo = useProject((s) => s.undo);
  const redo = useProject((s) => s.redo);

  const [name, setName] = useState(project?.project.name ?? '');
  useEffect(() => {
    setName(project?.project.name ?? '');
  }, [project?.project.name]);

  if (!project) return <div className="top-bar" />;

  function handleSave(): void {
    if (!project) return;
    try {
      downloadProject(project);
      rememberRecent(project);
      markSaved();
      toast.info('Project downloaded.');
    } catch (err) {
      toast.error(`Save failed: ${(err as Error).message}`);
    }
  }

  function commitName(): void {
    const trimmed = name.trim();
    if (trimmed && trimmed !== project!.project.name) renameProject(trimmed);
    else setName(project!.project.name);
  }

  return (
    <div className="top-bar">
      <div className="brand">
        <div className="brand-mark" aria-hidden />
        NZA-PV
      </div>
      <input
        className="project-name-input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={commitName}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setName(project.project.name);
            (e.target as HTMLInputElement).blur();
          }
        }}
        aria-label="Project name"
      />
      <span className="last-saved" title={lastSavedAt ? new Date(lastSavedAt).toLocaleString() : ''}>
        {lastSavedAt ? `Saved ${relativeTime(lastSavedAt)}` : 'Unsaved'}
      </span>
      <div className="spacer" />
      <button
        type="button"
        className="btn ghost"
        onClick={undo}
        disabled={past.length === 0}
        title="Undo (Ctrl+Z)"
      >
        ↶
      </button>
      <button
        type="button"
        className="btn ghost"
        onClick={redo}
        disabled={future.length === 0}
        title="Redo (Ctrl+Shift+Z)"
      >
        ↷
      </button>
      <button type="button" className="btn primary" onClick={handleSave} title="Save (Ctrl+S)">
        Save
      </button>
    </div>
  );
}

function relativeTime(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(ts).toLocaleDateString();
}
