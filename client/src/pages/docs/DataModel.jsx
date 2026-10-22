// Data model section of the documentation page (D2).
import { ENTITY_GROUPS, STATES, DECISIONS, TARGET, BOXES, EDGES } from './dataModel.js';

const W = 200, H = 46;
const FILL = {
  org: ['var(--gold-50)', 'var(--gold-500)'],
  people: ['var(--blue-50)', 'var(--blue-600)'],
  flow: ['var(--green-50)', 'var(--green-600)'],
  transport: ['var(--amber-50)', 'var(--amber-500)'],
  audit: ['var(--black-50)', 'var(--black-400)'],
};

// point where the line from the box centre towards (tx, ty) leaves the box
function edgePoint(x, y, tx, ty) {
  const cx = x + W / 2, cy = y + H / 2, dx = tx - cx, dy = ty - cy;
  const s = Math.min(Math.abs((W / 2) / (dx || 1e-9)), Math.abs((H / 2) / (dy || 1e-9)));
  return [cx + dx * s, cy + dy * s];
}

function Diagram() {
  const pos = Object.fromEntries(BOXES.map(([t, x, y, g]) => [t, { x, y, g }]));
  return (
    <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: '#fff' }}>
      <svg viewBox="0 0 1230 680" width="1230" height="680" role="img" aria-label="Entity relationship diagram" style={{ display: 'block', maxWidth: 'none' }}>
        <defs>
          <marker id="dm-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--black-500)" />
          </marker>
        </defs>
        {EDGES.map(([from, to, label]) => {
          const a = pos[from], b = pos[to];
          const [x1, y1] = edgePoint(a.x, a.y, b.x + W / 2, b.y + H / 2);
          const [x2, y2] = edgePoint(b.x, b.y, a.x + W / 2, a.y + H / 2);
          return (
            <g key={from + to}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--black-300)" strokeWidth="1.4" markerEnd="url(#dm-arrow)" />
              {label && <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 4} fontSize="10" textAnchor="middle" fill="var(--black-500)" style={{ paintOrder: 'stroke', stroke: '#fff', strokeWidth: 3 }}>{label}</text>}
            </g>
          );
        })}
        {BOXES.map(([t, x, y, g]) => (
          <g key={t}>
            <rect x={x} y={y} width={W} height={H} rx="8" fill={FILL[g][0]} stroke={FILL[g][1]} strokeWidth="1.5" />
            <text x={x + W / 2} y={y + H / 2 + 5} textAnchor="middle" fontSize="14" fontWeight="600" fill="var(--black-900)" fontFamily="ui-monospace, Menlo, monospace">{t}</text>
          </g>
        ))}
        <g transform="translate(760 30)">
          <rect width="450" height="128" rx="8" fill="#fff" stroke="var(--black-200)" strokeDasharray="5 4" />
          <text x="16" y="24" fontSize="13" fontWeight="600" fill="var(--black-900)">Configuration – rules as data (no foreign keys)</text>
          {['settings · lists · templates · holidays', 'windows · academic_years · translations', 'audit_log · sessions', 'mock_identities (simulated register)'].map((s, i) => (
            <text key={s} x="16" y={48 + i * 22} fontSize="12.5" fill="var(--black-600)" fontFamily="ui-monospace, Menlo, monospace">{s}</text>
          ))}
        </g>
      </svg>
    </div>
  );
}

export default function DataModel() {
  return (
    <section id="data-model" className="card">
      <h2>Data model (D2)</h2>
      <p className="small">
        A relational model in <code>server/db/schema.sql</code> (28 tables), accessed only through <code>server/db/index.js</code>.
        It runs on SQLite for the PoC and is written to move to PostgreSQL + PostGIS. Row counts below are from the starting synthetic data.
      </p>

      <h3 className="mt">Entity relationships</h3>
      <p className="small muted">Arrows point from the table holding the foreign key to the table it references (many → one). Colours group the tables by area. For readability the diagram leaves out applications → families (also reachable through the child) and documents → guardians.</p>
      <Diagram />
      <div className="row small mt">
        {[['org', 'Organisation & capacity'], ['people', 'People & families'], ['flow', 'Applications & placements'], ['transport', 'Transport'], ['audit', 'Notifications']].map(([g, l]) => (
          <span key={g} className="row" style={{ gap: 5 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: FILL[g][0], border: `1.5px solid ${FILL[g][1]}` }} />{l}</span>
        ))}
      </div>

      <h3 className="mt">Tables</h3>
      {ENTITY_GROUPS.map((g) => (
        <div key={g.group} className="mb">
          <h4 style={{ marginTop: 14 }}>{g.group}</h4>
          <div className="table-wrap"><table className="table">
            <thead><tr><th style={{ width: 150 }}>Table</th><th>Purpose</th><th style={{ width: '26%' }}>Key columns</th><th style={{ width: '16%' }}>Relationships</th><th>Requirements</th><th className="num">Rows</th></tr></thead>
            <tbody>{g.tables.map(([t, purpose, cols, rel, reqs, rows]) => (
              <tr key={t} id={`table-${t}`}>
                <td className="mono"><b>{t}</b></td><td className="small">{purpose}</td><td className="small mono">{cols}</td>
                <td className="small muted">{rel}</td><td className="small">{reqs}</td><td className="num small">{rows}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </div>
      ))}

      <h3 className="mt">Status values</h3>
      <div className="table-wrap"><table className="table">
        <thead><tr><th style={{ width: 190 }}>Column</th><th>Values and flow</th><th>Requirements</th></tr></thead>
        <tbody>{STATES.map(([c, v, r]) => <tr key={c}><td className="mono small"><b>{c}</b></td><td className="small">{v}</td><td className="small">{r}</td></tr>)}</tbody>
      </table></div>

      <h3 className="mt">Design decisions</h3>
      <div className="grid c2">
        {DECISIONS.map(([h, d]) => (
          <div key={h} className="card" style={{ padding: 14, background: 'var(--gold-50)' }}><b>{h}</b><p className="small" style={{ margin: '6px 0 0' }}>{d}</p></div>
        ))}
      </div>

      <h3 className="mt">PoC choice vs target (PostgreSQL + PostGIS phase)</h3>
      <div className="table-wrap"><table className="table">
        <thead><tr><th style={{ width: 130 }}>Aspect</th><th>PoC</th><th>Target</th></tr></thead>
        <tbody>{TARGET.map(([a, p, t]) => <tr key={a}><td><b>{a}</b></td><td className="small">{p}</td><td className="small">{t}</td></tr>)}</tbody>
      </table></div>
    </section>
  );
}
