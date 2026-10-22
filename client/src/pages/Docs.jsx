// PoC documentation: how each requirement and acceptance scenario is implemented, and what is flagged.
import { useEffect, useMemo, useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { useI18n } from '../i18n.jsx';
import { PERSONAS, DATA, REQUIREMENTS, SCENARIOS, GAPS, MOCKS } from './docs/content.js';
import DataModel from './docs/DataModel.jsx';
import Configuration from './docs/Configuration.jsx';

const STATUS = {
  done: ['Implemented', 'green'],
  partial: ['Partial – see note', 'amber'],
  sim: ['Simulated (as allowed)', 'blue'],
  gap: ['Not in PoC', 'red'],
};
const Status = ({ s }) => <span className={`badge ${STATUS[s][1]}`}>{STATUS[s][0]}</span>;

// Left menu: related sections grouped; children are sub-sections of a section
const TOC = [
  ['Getting started', [['overview', 'Overview'], ['run', 'Running the PoC'], ['personas', 'Personas & test identities']]],
  ['Solution design', [
    ['architecture', 'Architecture'],
    ['data-model', 'Data model', [['dm-diagram', 'Entity relationships'], ['dm-tables', 'Tables'], ['dm-states', 'Status values'], ['dm-decisions', 'Design decisions'], ['dm-target', 'PoC vs target']]],
    ['mocks', 'Mock services (D4)'],
  ]],
  ['Configuration', [
    ['configuration', 'Configuration guide', [['cfg-who', 'Who can do what'], ['cfg-catalogue', 'Configuration catalogue'], ['cfg-rules', 'Business rule settings'], ['cfg-governance', 'How changes are controlled'], ['cfg-not', 'Not configurable yet']]],
  ]],
  ['Requirements coverage', [
    ['scenarios', 'Acceptance scenarios A1–A16'],
    ['requirements', 'Requirements traceability', REQUIREMENTS.map((r, i) => [`req-${i}`, r.section])],
    ['data', 'Synthetic test data'],
  ]],
  ['Gaps & roadmap', [['gaps', 'Flags: not / partially implemented'], ['next', 'Next phase: real backend']]],
];
const ALL_IDS = TOC.flatMap(([, items]) => items.flatMap(([id, , subs]) => [id, ...(subs || []).map(([sid]) => sid)]));

function DocsMenu({ active, onGo }) {
  const parentOf = (id) => TOC.flatMap(([, items]) => items).find(([pid, , subs]) => pid === id || (subs || []).some(([sid]) => sid === id))?.[0];
  return (
    <nav className="docs-toc" aria-label="Documentation sections">
      <div className="toc-title">Contents</div>
      {TOC.map(([group, items]) => (
        <div key={group}>
          <div className="toc-group">{group}</div>
          {items.map(([id, label, subs]) => (
            <div key={id}>
              <a href={`#${id}`} className={parentOf(active) === id ? 'active' : ''} onClick={(e) => onGo(e, id)}>{label}</a>
              {subs && parentOf(active) === id && (
                <div className="toc-subs">
                  {subs.map(([sid, sl]) => <a key={sid} href={`#${sid}`} className={`sub ${active === sid ? 'active' : ''}`} onClick={(e) => onGo(e, sid)}>{sl}</a>)}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </nav>
  );
}

export default function Docs() {
  const { lang } = useI18n();
  const loc = useLocation();
  const [q, setQ] = useState('');
  const [onlyFlags, setOnlyFlags] = useState(false);

  useEffect(() => {
    if (!loc.hash) return;
    const el = document.getElementById(decodeURIComponent(loc.hash.slice(1)));
    if (!el) return;
    if (el.tagName === 'TR') {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.style.background = 'var(--gold-100)';
      setTimeout(() => (el.style.background = ''), 2500);
    } else el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [loc.hash]);

  // highlight the section currently at the top of the viewport
  const [active, setActive] = useState('overview');
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        // the anchor closest above the line just under the sticky header wins
        let cur = ALL_IDS[0], best = -Infinity;
        for (const id of ALL_IDS) {
          const top = document.getElementById(id)?.getBoundingClientRect().top;
          if (top !== undefined && top <= 130 && top > best) { best = top; cur = id; }
        }
        setActive(cur);
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf); };
  }, []);
  const go = (e, id) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    history.replaceState(null, '', `#${id}`);
  };

  const counts = useMemo(() => {
    const c = { done: 0, partial: 0, sim: 0, gap: 0 };
    REQUIREMENTS.forEach((s) => s.items.forEach((i) => c[i[4]]++));
    return c;
  }, []);
  const match = (i) => (!onlyFlags || i[4] !== 'done') && (!q || i.join(' ').toLowerCase().includes(q.toLowerCase()));

  return (
    <div dir="ltr" lang="en">
      {lang === 'ar' && <div className="alert info mb" dir="rtl">صفحة التوثيق الفنية متاحة باللغة الإنجليزية فقط في هذا النموذج.</div>}
      <div className="docs-layout">
        <DocsMenu active={active} onGo={go} />
        <div className="docs-main">
      <section id="overview" className="card" style={{ borderTop: '4px solid var(--gold-500)' }}>
        <h1>MoE School Registration Portal – PoC documentation</h1>
        <p>
          A locally deployed working prototype of the Ministry of Education School Registration Portal (requirements document V1, 21 October 2026).
          It covers the <b>parent portal</b>, the <b>school and cluster back office</b>, <b>capacity and catchment management</b>, <b>insights and reports</b>,
          notifications and administration, in English and Arabic, on synthetic data for one pilot cluster (Sharjah Cluster 1, 12 schools).
        </p>
        <div className="grid c4">
          <div className="stat accent"><div className="label">Requirements implemented</div><div className="value">{counts.done}</div></div>
          <div className="stat"><div className="label">Simulated (as allowed)</div><div className="value">{counts.sim}</div></div>
          <div className="stat"><div className="label">Partial – flagged</div><div className="value">{counts.partial}</div></div>
          <div className="stat"><div className="label">Not in PoC</div><div className="value">{counts.gap}</div></div>
        </div>
      </section>

      <section id="run" className="card">
        <h2>Running the PoC</h2>
        <pre className="card" style={{ background: 'var(--black-900)', color: '#f2ecd2', overflowX: 'auto', fontSize: '.85rem' }}>{`npm run setup        # install, generate synthetic data, build the web app
npm start            # http://localhost:3000
npm run dev          # development: API on :3000 + hot-reload UI on :5173
npm run seed         # reset the database to the starting synthetic data
node tests/scenarios.mjs   # run acceptance scenarios A1–A16 against the API (BASE=http://localhost:3000)`}</pre>
        <p className="small muted">Requires Node.js 22.13+ (uses the built-in SQLite driver). Map tiles load from OpenStreetMap, so the browser needs internet access; everything else is local.</p>
        <p className="small">Demo controls (Ministry Administrator → Demo controls) move the demo clock forward to show service-level breaches, offer lapses and leaving-date seat releases, and run the scheduled jobs on demand.</p>
      </section>

      <section id="personas" className="card">
        <h2>Personas &amp; test identities</h2>
        <p className="small">Parents sign in through the simulated UAE PASS screen (pick the identity or type the Emirates ID). Staff pick a persona on the home page.</p>
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Persona</th><th>Role</th><th>Sign-in</th><th>Scenarios</th></tr></thead>
          <tbody>{PERSONAS.map((p) => <tr key={p.who}><td><b>{p.who}</b></td><td>{p.role}</td><td className="mono small">{p.how}</td><td>{p.use}</td></tr>)}</tbody>
        </table></div>
      </section>

      <section id="architecture" className="card">
        <h2>Architecture of the prototype</h2>
        <div className="grid c3 small">
          {[
            ['Web app (React + Vite)', 'Parent portal, back office, administration, insights. Bilingual resource files, full RTL layout, Leaflet maps, responsive.'],
            ['API (Node.js + Express)', 'REST endpoints per area (auth, family, back office, admin, reports). Role-based access enforced server-side for every request.'],
            ['Domain services', 'Application state machine, working-day SLA clock, capacity & alerts, priority rules, notifications, reports, Excel export, scheduler.'],
            ['Rules as data', 'Business rules, lists, templates, windows, holidays and translations held in tables and edited on screen – no code change needed.'],
            ['Data store (SQLite)', 'Relational model (server/db/schema.sql) portable to PostgreSQL / PostGIS. Serialised write transactions guard the last seat.'],
            ['Mock integrations', 'UAE PASS, ICP, SIS, maps, transport, email, SMS behind the interfaces the real adapters will implement.'],
          ].map(([h, d]) => <div key={h} className="card" style={{ background: 'var(--gold-50)' }}><b>{h}</b><p className="muted" style={{ margin: '6px 0 0' }}>{d}</p></div>)}
        </div>
        <p className="small mt">Source layout: <code>server/db</code> schema &amp; data access · <code>server/services</code> domain logic · <code>server/mocks</code> simulated integrations · <code>server/routes</code> API · <code>server/seed</code> synthetic data · <code>server/i18n</code> English / Arabic resource files · <code>client/src</code> web app · <code>tests/scenarios.mjs</code> acceptance run.</p>
      </section>

      <DataModel />

      <section id="mocks" className="card">
        <h2>Mock services and their interfaces (Section 8 / D4)</h2>
        <p className="small">Implemented in <code>server/mocks/index.js</code>. Each function has the shape the real adapter will implement, so the mocks can be replaced one by one. Generated emails and SMS are visible under <Link to="/mock/outbox">Mock email &amp; SMS</Link>.</p>
        <div className="table-wrap"><table className="table">
          <thead><tr><th>System</th><th>Interface</th><th>HTTP facade</th></tr></thead>
          <tbody>{MOCKS.map(([a, b, c]) => <tr key={a}><td><b>{a}</b></td><td className="mono small">{b}</td><td className="mono small">{c}</td></tr>)}</tbody>
        </table></div>
      </section>

      <Configuration />

      <section id="scenarios" className="card">
        <h2>Acceptance scenarios (Section 10.1)</h2>
        <p className="small">Every scenario is also executed automatically against the API by <code>tests/scenarios.mjs</code>.</p>
        <div className="table-wrap"><table className="table">
          <thead><tr><th>#</th><th>Scenario</th><th>How to run it in the PoC</th><th>Requirements</th><th>Status</th></tr></thead>
          <tbody>{SCENARIOS.map(([id, title, steps, reqs, s, note]) => (
            <tr key={id} id={id}><td><b>{id}</b></td><td><b>{title}</b></td><td className="small">{steps}{note && <div className="alert warn small" style={{ marginTop: 6 }}>{note}</div>}</td><td className="small">{reqs}</td><td><Status s={s} /></td></tr>
          ))}</tbody>
        </table></div>
      </section>

      <section id="requirements" className="card">
        <div className="card-head">
          <h2>Requirements traceability</h2>
          <div className="row">
            <input placeholder="Search requirement, screen, module…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 260 }} />
            <label className="check small"><input type="checkbox" checked={onlyFlags} onChange={(e) => setOnlyFlags(e.target.checked)} /> Only flagged items</label>
          </div>
        </div>
        {REQUIREMENTS.map((sec, i) => {
          const items = sec.items.filter(match);
          if (!items.length) return null;
          return (
            <div key={sec.section} id={`req-${i}`} className="mb">
              <h3 style={{ marginTop: 14 }}>{sec.section}</h3>
              <div className="table-wrap"><table className="table">
                <thead><tr><th style={{ width: 70 }}>ID</th><th style={{ width: '24%' }}>Requirement</th><th>How it is implemented</th><th style={{ width: '18%' }}>Where</th><th>Status</th></tr></thead>
                <tbody>{items.map(([id, req, how, where, s, note]) => (
                  <tr key={id + req} id={id}>
                    <td><b>{id}</b></td><td className="small">{req}</td>
                    <td className="small">{how}{note && <div className="alert warn small" style={{ marginTop: 6 }}><b>Flag:</b>&nbsp;{note}</div>}</td>
                    <td className="small muted">{where}</td><td><Status s={s} /></td>
                  </tr>
                ))}</tbody>
              </table></div>
            </div>
          );
        })}
      </section>

      <section id="data" className="card">
        <h2>Synthetic data (Section 7)</h2>
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Item</th><th>What the PoC contains</th><th>Status</th></tr></thead>
          <tbody>{DATA.map(([a, b, s]) => <tr key={a}><td><b>{a}</b></td><td>{b}</td><td><Status s={s} /></td></tr>)}</tbody>
        </table></div>
      </section>

      <section id="gaps" className="card" style={{ borderTop: '4px solid var(--amber-500)' }}>
        <h2>Flags: requirements not, or only partially, implemented in the PoC</h2>
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Item</th><th>State</th><th>Explanation / plan</th></tr></thead>
          <tbody>{GAPS.map(([a, b, c]) => <tr key={a}><td><b>{a}</b></td><td><span className={`badge ${b === 'Out of scope' ? '' : b === 'Simulated' ? 'blue' : 'amber'}`}>{b}</span></td><td className="small">{c}</td></tr>)}</tbody>
        </table></div>
      </section>

      <section id="next" className="card">
        <h2>Next phase: towards the real backend</h2>
        <ol className="small">
          <li><b>Database</b> – move the schema to PostgreSQL + PostGIS (catchments as geometry, spatial indexes); seat allocation with row-level locks; migrations.</li>
          <li><b>Identity</b> – UAE PASS OIDC (staging) for parents; Ministry SSO (e.g. Entra ID) for staff; role and permission claims mapped to the existing role model.</li>
          <li><b>Integrations</b> – replace each mock behind its interface: ICP, SIS placement API, GIS / Makani, transport system, SMTP relay and SMS gateway via a queue with retries.</li>
          <li><b>Documents</b> – object storage with virus scanning; server-side bilingual PDF generation (offer letter, receipt) with Arabic shaping.</li>
          <li><b>Jobs &amp; reporting</b> – scheduler as a separate worker; reporting views / read replica for the insights at scale; hourly refresh guarantee.</li>
          <li><b>Hosting</b> – containerised API + web, environments for the acceptance session, observability and audit retention.</li>
        </ol>
      </section>

        </div>
      </div>
    </div>
  );
}
