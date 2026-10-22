// Configuration guide section of the documentation page.
import { Link } from 'react-router-dom';
import { ROLE_COLS, CATALOGUE, RULE_SETTINGS, GOVERNANCE, NOT_CONFIGURABLE } from './configuration.js';

const Cell = ({ v }) =>
  v === 'change' ? <span className="badge green">Change</span>
    : v === 'view' ? <span className="badge">View</span>
      : <span className="muted">—</span>;

export default function Configuration() {
  return (
    <section id="configuration" className="card">
      <h2>Configuration guide</h2>
      <p className="small">
        What can be configured in the portal without a code change, on which screen, and by which role. All configuration
        sits with the <b>Ministry Administrator</b> as the requirements define it (Section 3, AD-01…AD-06), with two exceptions:
        bus route capacity belongs to the <b>Transport Coordinator</b>, and parents manage their own family settings.
        The <b>Ministry Viewer</b> can open every administration screen read-only.
      </p>

      <h3 className="mt" id="cfg-who">Who can do what</h3>
      <div className="table-wrap"><table className="table">
        <thead><tr><th>Configuration area</th>{ROLE_COLS.map(([k, l]) => <th key={k} style={{ whiteSpace: 'normal', minWidth: 90 }} className="small">{l}</th>)}</tr></thead>
        <tbody>{CATALOGUE.map(([id, area, , , who]) => (
          <tr key={id}><td><a href={`#cfg-item-${id}`}><b>{area}</b></a></td>{ROLE_COLS.map(([k]) => <td key={k}><Cell v={who[k]} /></td>)}</tr>
        ))}</tbody>
      </table></div>
      <p className="small muted">Cluster Officers have no configuration rights: they act on escalations and see cluster capacity. "Change" for the Ministry Administrator includes administrators with or without the force-registration permission; force registration itself is restricted to holders of the permission.</p>

      <h3 className="mt" id="cfg-catalogue">Configuration catalogue</h3>
      <div className="table-wrap"><table className="table">
        <thead><tr><th style={{ width: '17%' }}>Area</th><th>What can be configured</th><th style={{ width: '14%' }}>Screen</th><th style={{ width: '15%' }}>Takes effect</th><th style={{ width: 110 }}>Requirements</th></tr></thead>
        <tbody>{CATALOGUE.map(([id, area, screen, path, , what, effect, reqs]) => (
          <tr key={id} id={`cfg-item-${id}`}>
            <td><b>{area}</b></td><td className="small">{what}</td>
            <td className="small"><Link to={path}>{screen}</Link></td><td className="small muted">{effect}</td><td className="small">{reqs}</td>
          </tr>
        ))}</tbody>
      </table></div>

      <h3 className="mt" id="cfg-rules">Business rule settings</h3>
      <p className="small muted">Edited on <Link to="/admin/rules">Rules &amp; settings</Link> by the Ministry Administrator. The starting values are those in the requirements; the Ministry replaces them with its own on acceptance day (A13).</p>
      <div className="table-wrap"><table className="table">
        <thead><tr><th style={{ width: 70 }}>Rule</th><th>What it controls</th><th>Starting value</th><th>Can be set to</th><th style={{ width: '18%' }}>Setting key</th></tr></thead>
        <tbody>{RULE_SETTINGS.map(([key, rule, what, start, options]) => (
          <tr key={key}><td><b>{rule}</b></td><td className="small">{what}</td><td className="small">{start}</td><td className="small">{options}</td><td className="mono small muted">{key}</td></tr>
        ))}</tbody>
      </table></div>

      <h3 className="mt" id="cfg-governance">How changes are controlled</h3>
      <div className="grid c2">
        {GOVERNANCE.map(([h, d]) => <div key={h} className="card" style={{ padding: 14, background: 'var(--gold-50)' }}><b>{h}</b><p className="small" style={{ margin: '6px 0 0' }}>{d}</p></div>)}
      </div>

      <h3 className="mt" id="cfg-not">Not configurable yet</h3>
      <p className="small muted">These are set in code today. They were assessed as candidates for a separate Portal Administrator role, which is on hold pending confirmation from the Ministry (it is not one of the roles in Section 3).</p>
      <div className="table-wrap"><table className="table">
        <thead><tr><th style={{ width: '24%' }}>Area</th><th>Fixed today</th></tr></thead>
        <tbody>{NOT_CONFIGURABLE.map(([a, d]) => <tr key={a}><td><b>{a}</b></td><td className="small">{d}</td></tr>)}</tbody>
      </table></div>
    </section>
  );
}
