// Project-wide PV summary. Activated by clicking the PV step in the left
// rail. Shows the building total kWp / kWh / panel count and a per-
// building breakdown table.

import { BASE_ANNUAL_YIELD_KWH_PER_KWP, summariseFaces } from '@nza-pv/shared';
import { flyToBuilding } from '../lib/drawing/mapBridge.js';
import { useProject } from '../store/projectStore.js';

export function PvPanel(): JSX.Element {
  const buildings = useProject((s) => s.project?.buildings ?? []);
  const select = useProject((s) => s.select);

  // Aggregate every face on every building. Empty buildings (no faces
  // yet) contribute zero.
  const projectTotal = summariseFaces(buildings.flatMap((b) => b.faces));
  const eligibleFaceCount = buildings
    .flatMap((b) => b.faces)
    .filter((f) => f.is_pv_eligible).length;

  return (
    <div style={{ padding: '4px 2px' }}>
      <h3 className="section-title" style={{ margin: '0 0 10px' }}>
        Project PV summary
      </h3>

      {buildings.length === 0 ? (
        <div className="empty">
          No buildings yet — draw some footprints and apply roofs to see PV totals here.
        </div>
      ) : (
        <>
          <div className="pv-stats">
            <PvStat label="Total kWp" value={`${projectTotal.nominal_kwp.toFixed(1)} kWp`} />
            <PvStat
              label="Annual yield"
              value={`${projectTotal.annual_kwh.toLocaleString()} kWh`}
            />
            <PvStat label="Panels" value={`${projectTotal.panel_count}`} />
            <PvStat label="PV faces" value={`${eligibleFaceCount}`} />
          </div>

          <div style={{ marginTop: 14 }}>
            <div className="muted" style={{ fontSize: 11, marginBottom: 6 }}>
              Per building
            </div>
            <table className="pv-table">
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Building</th>
                  <th style={{ textAlign: 'right' }}>kWp</th>
                  <th style={{ textAlign: 'right' }}>kWh/yr</th>
                  <th style={{ textAlign: 'right' }}>Panels</th>
                </tr>
              </thead>
              <tbody>
                {buildings.map((b) => {
                  const t = summariseFaces(b.faces);
                  return (
                    <tr
                      key={b.id}
                      onClick={() => {
                        select({ kind: 'building', buildingId: b.id });
                        flyToBuilding(b);
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      <td>{b.name}</td>
                      <td className="tabular" style={{ textAlign: 'right' }}>
                        {t.nominal_kwp.toFixed(1)}
                      </td>
                      <td className="tabular" style={{ textAlign: 'right' }}>
                        {t.annual_kwh.toLocaleString()}
                      </td>
                      <td className="tabular" style={{ textAlign: 'right' }}>
                        {t.panel_count}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="muted" style={{ fontSize: 11, marginTop: 14, lineHeight: 1.5 }}>
            Annual yield is a Phase-1 placeholder: nominal kWp × {BASE_ANNUAL_YIELD_KWH_PER_KWP}{' '}
            kWh/kWp UK baseline × tilt / azimuth correction. Accurate to roughly ±10% for
            pre-feasibility. Real PVGIS-driven generation lands in Phase 5.
          </p>
        </>
      )}
    </div>
  );
}

function PvStat({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="pv-stat">
      <div
        className="muted"
        style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4 }}
      >
        {label}
      </div>
      <div className="tabular" style={{ fontSize: 16, fontWeight: 600, marginTop: 2 }}>
        {value}
      </div>
    </div>
  );
}
