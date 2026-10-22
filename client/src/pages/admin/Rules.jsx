// AD-02 / TR-03: every business rule in section 5 is held as data and edited here – no code change.
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { useI18n } from '../../i18n.jsx';
import { useAsync, useAction, PageHead, Loader, Card, ReqTag } from '../../components/ui.jsx';
import { useReadOnly, ReadOnlyNote } from '../../components/AdminBits.jsx';

// [setting key, requirement id, editor]
const GROUPS = [
  ['bo.rules.g_grades', [['grade_age_rules', 'BR-01', 'age'], ['transfer_grade_rule', 'BR-02', 'info'], ['eligible_schools_rule', 'BR-03', 'info']]],
  ['bo.rules.g_applications', [['max_preferences', 'BR-04', 'number'], ['priority_order', 'BR-05', 'order'], ['max_active_applications_per_child', 'BR-11', 'number'], ['out_of_catchment_suggestions', 'PP-11', 'number']]],
  ['bo.rules.g_time', [['decision_sla_working_days', 'BR-06', 'number'], ['info_response_working_days', 'BR-07', 'number'], ['offer_acceptance_working_days', 'BR-08', 'number'], ['working_weekdays', 'AD-04', 'weekdays']]],
  ['bo.rules.g_docs', [['utility_bill_max_age_months', 'BR-10', 'number'], ['max_file_mb', 'PP-13', 'number'], ['allowed_file_types', 'PP-13', 'json'], ['doc_matrix', 'Section 6', 'matrix'], ['doc_conditions', 'Section 6', 'json']]],
  ['bo.rules.g_capacity', [['capacity_warning_threshold', 'BR-12', 'number'], ['limited_seat_pct', 'PP-10', 'number'], ['bus_seat_hold', 'BR-09', 'json'], ['exceptional_transfer_approver', 'BR-14', 'approver'], ['default_emirate', 'PP-17', 'text']]],
];
const PATHS = ['new', 'private', 'other_emirate', 'abroad', 'renewal', 'renewal_moved'];
const REQ = ['R', 'C', 'E', 'M', '-'];

function Editor({ kind, value, onChange, ro }) {
  const { t } = useI18n();
  const { label } = useAuth();
  if (kind === 'number') return <input type="number" style={{ maxWidth: 160 }} disabled={ro} value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} />;
  if (kind === 'text' || kind === 'info') return <input disabled={ro} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
  if (kind === 'approver') return <select disabled={ro} value={value} onChange={(e) => onChange(e.target.value)}>{['cluster_officer', 'ministry_admin'].map((r) => <option key={r} value={r}>{t(`role.${r}`)}</option>)}</select>;
  if (kind === 'age') {
    return (
      <div className="form-grid">
        <label className="field"><span>{t('bo.rules.cutoff')}</span><input disabled={ro} value={value.cutoff} onChange={(e) => onChange({ ...value, cutoff: e.target.value })} placeholder="MM-DD" /></label>
        {Object.entries(value.ages).map(([g, a]) => (
          <label key={g} className="field"><span>{t('bo.rules.age_for', { grade: t(`grade.${g}`) })}</span><input type="number" disabled={ro} value={a} onChange={(e) => onChange({ ...value, ages: { ...value.ages, [g]: Number(e.target.value) } })} /></label>
        ))}
      </div>
    );
  }
  if (kind === 'order') {
    const move = (i, d) => { const x = [...value]; [x[i], x[i + d]] = [x[i + d], x[i]]; onChange(x); };
    return (
      <ol style={{ margin: 0, paddingInlineStart: 20 }}>
        {value.map((k, i) => (
          <li key={k} className="row" style={{ gap: 6, marginBottom: 4 }}>
            <span style={{ minWidth: 220 }}>{t(`bo.prio.${k}`)}</span>
            {!ro && <><button className="btn ghost sm" disabled={i === 0} onClick={() => move(i, -1)}>▲</button><button className="btn ghost sm" disabled={i === value.length - 1} onClick={() => move(i, 1)}>▼</button></>}
          </li>
        ))}
      </ol>
    );
  }
  if (kind === 'weekdays') {
    return (
      <div className="row">
        {[1, 2, 3, 4, 5, 6, 0].map((d) => (
          <label key={d} className="check"><input type="checkbox" disabled={ro} checked={value.includes(d)} onChange={(e) => onChange(e.target.checked ? [...value, d].sort() : value.filter((x) => x !== d))} />{t(`bo.day.${d}`)}</label>
        ))}
      </div>
    );
  }
  if (kind === 'matrix') {
    return (
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>{t('bo.rules.doc')}</th>{PATHS.map((p) => <th key={p}>{t(`bo.rules.path.${p}`)}</th>)}</tr></thead>
          <tbody>
            {Object.entries(value).map(([doc, row]) => (
              <tr key={doc}>
                <td className="small">{label('doc_type', doc)}</td>
                {PATHS.map((p) => (
                  <td key={p}>
                    <select disabled={ro} value={row[p] ?? '-'} style={{ padding: '3px 4px' }} title={t(`docreq.${row[p] ?? '-'}`)} onChange={(e) => onChange({ ...value, [doc]: { ...row, [p]: e.target.value } })}>
                      {REQ.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="small muted" style={{ padding: 8 }}>{REQ.map((r) => `${r} = ${t(`docreq.${r}`)}`).join(' · ')}</p>
      </div>
    );
  }
  return <JsonEditor value={value} onChange={onChange} ro={ro} />;
}

function JsonEditor({ value, onChange, ro }) {
  const { t } = useI18n();
  const [txt, setTxt] = useState(JSON.stringify(value, null, 1));
  const [bad, setBad] = useState(false);
  useEffect(() => setTxt(JSON.stringify(value, null, 1)), []);
  return (
    <>
      <textarea className="mono" rows={Math.min(12, txt.split('\n').length + 1)} disabled={ro} value={txt} onChange={(e) => {
        setTxt(e.target.value);
        try { onChange(JSON.parse(e.target.value)); setBad(false); } catch { setBad(true); }
      }} />
      {bad && <div className="hint" style={{ color: 'var(--red-700)' }}>{t('bo.rules.bad_json')}</div>}
    </>
  );
}

function SettingCard({ k, req, kind, setting, ro, onSaved }) {
  const { t, fmtDateTime } = useI18n();
  const [v, setV] = useState(setting.value);
  const [reason, setReason] = useState('');
  const [raw, setRaw] = useState(false);
  const [run, busy] = useAction();
  useEffect(() => setV(setting.value), [setting]);
  const dirty = JSON.stringify(v) !== JSON.stringify(setting.value);
  return (
    <div style={{ borderTop: '1px solid var(--border)', padding: '14px 0' }} id={req}>
      <div className="row between">
        <div><b>{t(`bo.set.${k}`, { default: k })}</b> <ReqTag id={req.startsWith('Section') ? 'section-6' : req} /> <code className="small">{k}</code></div>
        <span className="small muted">{t('bo.rules.updated', { at: fmtDateTime(setting.updated_at) })}</span>
      </div>
      <p className="small muted" style={{ margin: '2px 0 8px' }}>{t(`bo.set.${k}.help`, { default: '' })}</p>
      {raw && kind !== 'json' ? <JsonEditor value={v} onChange={setV} ro={ro} /> : <Editor kind={kind} value={v} onChange={setV} ro={ro} />}
      {!ro && (
        <div className="row mt" style={{ marginTop: 8 }}>
          {kind !== 'json' && kind !== 'number' && <button className="btn ghost sm" onClick={() => setRaw(!raw)}>{raw ? t('bo.rules.friendly') : t('bo.rules.raw')}</button>}
          {dirty && (
            <>
              <input style={{ maxWidth: 280 }} placeholder={t('bo.rules.reason_ph')} value={reason} onChange={(e) => setReason(e.target.value)} />
              <button className="btn sm" disabled={busy} onClick={() => run(() => api.put(`/admin/settings/${k}`, { value: v, reason }), t('bo.rules.saved')).then(() => { setReason(''); onSaved(); }).catch(() => {})}>{t('common.save')}</button>
              <button className="btn secondary sm" onClick={() => setV(setting.value)}>{t('common.reset')}</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function Rules() {
  const { t } = useI18n();
  const ro = useReadOnly();
  const { refreshLookups } = useAuth();
  const st = useAsync(() => api.get('/admin/settings'), []);
  return (
    <>
      <PageHead title={t('nav.rules')} sub={t('bo.rules.sub')} reqs={['AD-02', 'TR-03', 'A13']} />
      <ReadOnlyNote />
      <Loader state={st}>
        {(rows) => {
          const by = Object.fromEntries(rows.map((r) => [r.key, r]));
          return (
            <>
              {GROUPS.map(([title, items]) => (
                <Card key={title} title={t(title)}>
                  {items.filter(([k]) => by[k]).map(([k, req, kind]) => <SettingCard key={k} k={k} req={req} kind={kind} setting={by[k]} ro={ro} onSaved={() => { st.reload(); refreshLookups(); }} />)}
                </Card>
              ))}
              <Card title={t('bo.rules.g_lists')}>
                <p className="small">{t('bo.rules.lists_text')} <ReqTag id="BR-13" /> <ReqTag id="AD-03" /></p>
                <Link className="btn secondary sm" to="/admin/lists">{t('nav.lists')} →</Link>
              </Card>
            </>
          );
        }}
      </Loader>
    </>
  );
}
