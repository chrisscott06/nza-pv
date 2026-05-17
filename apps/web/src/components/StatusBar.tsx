import { useProject } from '../store/projectStore.js';

export function StatusBar(): JSX.Element {
  const project = useProject((s) => s.project);
  const view = useProject((s) => s.view);
  const tool = useProject((s) => s.tool);
  const lastSavedAt = useProject((s) => s.lastSavedAt);

  if (!project) {
    return (
      <div className="status-bar">
        <span>NZA-PV · Phase 1</span>
        <div className="spacer" />
        <span className="muted">No project open</span>
      </div>
    );
  }

  return (
    <div className="status-bar">
      <span className="pill">{project.project.name}</span>
      <span>Step: Buildings</span>
      <span className="muted">View: {view.toUpperCase()}</span>
      <span className="muted">Tool: {tool.kind}</span>
      <span className="muted">{project.buildings.length} buildings</span>
      <div className="spacer" />
      <span className="muted">
        {lastSavedAt
          ? `Last save ${new Date(lastSavedAt).toLocaleTimeString()}`
          : 'Autosaving to browser'}
      </span>
    </div>
  );
}
