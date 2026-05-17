type Step = { id: string; label: string; glyph: string; active: boolean };

const STEPS: Step[] = [
  { id: 'buildings', label: 'Buildings', glyph: '🏠', active: true },
  { id: 'roofs', label: 'Roofs', glyph: '⛰', active: false },
  { id: 'pv', label: 'PV', glyph: '⚡', active: false },
  { id: 'report', label: 'Report', glyph: '📄', active: false },
];

export function LeftRail(): JSX.Element {
  return (
    <nav className="left-rail" aria-label="Workflow steps">
      {STEPS.map((s) => (
        <div
          key={s.id}
          className={`step ${s.active ? 'active' : ''}`}
          title={s.active ? s.label : `${s.label} — coming in a later phase`}
        >
          <span className="glyph" aria-hidden>
            {s.glyph}
          </span>
          {s.label}
        </div>
      ))}
    </nav>
  );
}
