import { type ToolMode, type ViewMode, useProject } from '../store/projectStore.js';

// Editing tools (push-pull, vertex) are surfaced as on-canvas handles when a
// building is selected — they don't live in the toolbar.
const TOOLS: Array<{ id: ToolMode['kind']; label: string; glyph: string; hint: string }> = [
  {
    id: 'select',
    label: 'Select',
    glyph: '⌖',
    hint: 'Click a building to select. Drag the handles to rotate or push-pull.',
  },
  {
    id: 'draw-rect',
    label: 'Rectangle',
    glyph: '▭',
    hint: 'Click-drag to draw a rectangular building',
  },
  {
    id: 'draw-polygon',
    label: 'Polygon',
    glyph: '⬠',
    hint: 'Click vertices, double-click to close',
  },
];

export function Toolbar(): JSX.Element {
  const tool = useProject((s) => s.tool);
  const setTool = useProject((s) => s.setTool);
  const view = useProject((s) => s.view);
  const setView = useProject((s) => s.setView);

  function pick(id: ToolMode['kind']): void {
    setTool({ kind: id } as ToolMode);
  }

  function setViewMode(v: ViewMode): void {
    setView(v);
  }

  return (
    <div className="toolbar" role="toolbar" aria-label="Drawing tools">
      {TOOLS.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`tool ${tool.kind === t.id ? 'active' : ''}`}
          onClick={() => pick(t.id)}
          title={t.hint}
        >
          <span className="glyph" aria-hidden>
            {t.glyph}
          </span>
          {t.label}
        </button>
      ))}
      <div className="sep" />
      <div className="view-toggle" role="tablist" aria-label="View mode">
        <button
          type="button"
          className={view === '2d' ? 'active' : ''}
          onClick={() => setViewMode('2d')}
          title="2D plan view (1)"
        >
          2D
        </button>
        <button
          type="button"
          className={view === 'split' ? 'active' : ''}
          onClick={() => setViewMode('split')}
          title="Split 2D / 3D (2)"
        >
          Split
        </button>
        <button
          type="button"
          className={view === '3d' ? 'active' : ''}
          onClick={() => setViewMode('3d')}
          title="3D oblique view (3)"
        >
          3D
        </button>
      </div>
    </div>
  );
}
