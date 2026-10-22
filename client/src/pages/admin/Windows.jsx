// AD-01: academic years and the new-registration / renewal / transfer windows.
import { useState } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { useI18n } from '../../i18n.jsx';
import { useAsync, useAction, PageHead, Loader, Card, Modal, Field, DataTable } from '../../components/ui.jsx';
import { useReadOnly, ReadOnlyNote } from '../../components/AdminBits.jsx';

function WindowRow({ w, ro, onSaved, today }) {
  const { t } = useI18n();
  const [v, setV] = useState({ open_date: w.open_date, close_date: w.close_date });
  const [run, busy] = useAction();
  const open = today >= w.open_date && today <= w.close_date;
  const dirty = v.open_date !== w.open_date || v.close_date !== w.close_date;
  return (
    <tr>
      <td>{w.ay}</td>
      <td><b>{t(`bo.win.${w.type}`)}</b></td>
      <td><input type="date" disabled={ro} value={v.open_date} onChange={(e) => setV({ ...v, open_date: e.target.value })} /></td>
      <td><input type="date" disabled={ro} value={v.close_date} onChange={(e) => setV({ ...v, close_date: e.target.value })} /></td>
      <td>{open ? <span className="badge green">{t('bo.win.open')}</span> : <span className="badge">{t('bo.win.closed')}</span>}</td>
      <td>{!ro && dirty && <button className="btn sm" disabled={busy} onClick={() => run(() => api.put(`/admin/windows/${w.id}`, v), t('common.saved')).then(onSaved).catch(() => {})}>{t('common.save')}</button>}</td>
    </tr>
  );
}

function YearRow({ y, ro, onSaved, currentCode }) {
  const [rolling, setRolling] = useState(false);
  const { t } = useI18n();
  const [v, setV] = useState({ start_date: y.start_date, end_date: y.end_date });
  const [run, busy] = useAction();
  const dirty = v.start_date !== y.start_date || v.end_date !== y.end_date;
  const setRole = (role) => {
    if (role === 'admission' && !window.confirm(t('bo.win.confirm_admission', { code: y.code }))) return;
    run(() => api.post(`/admin/academic-years/${y.code}/role`, { role }), t('common.saved')).then(onSaved).catch(() => {});
  };
  const remove = () => {
    if (!window.confirm(t('bo.win.confirm_delete', { code: y.code }))) return;
    run(() => api.del(`/admin/academic-years/${y.code}`), t('common.saved')).then(onSaved).catch(() => {});
  };
  return (
    <tr>
      <td><b>{y.code}</b></td>
      <td><input type="date" disabled={ro} value={v.start_date} onChange={(e) => setV({ ...v, start_date: e.target.value })} /></td>
      <td><input type="date" disabled={ro} value={v.end_date} onChange={(e) => setV({ ...v, end_date: e.target.value })} /></td>
      <td>{y.is_current ? <span className="badge blue">{t('bo.win.current')}</span> : null} {y.is_admission ? <span className="badge gold">{t('bo.win.admission')}</span> : null}</td>
      <td>
        {!ro && (
          <div className="row" style={{ gap: 6 }}>
            {dirty && <button className="btn sm" disabled={busy} onClick={() => run(() => api.put(`/admin/academic-years/${y.code}`, v), t('common.saved')).then(onSaved).catch(() => {})}>{t('common.save')}</button>}
            {!y.is_current && <button className="btn ghost sm" disabled={busy} onClick={() => setRole('current')}>{t('bo.win.set_current')}</button>}
            {!y.is_admission && y.code >= currentCode && <button className="btn ghost sm" disabled={busy} onClick={() => setRole('admission')}>{t('bo.win.set_admission')}</button>}
            {y.has_previous && y.code > currentCode && <button className="btn secondary sm" disabled={busy} onClick={() => setRolling(true)}>{t('bo.roll.button')}</button>}
            {!y.is_current && !y.is_admission && !y.in_use && <button className="btn ghost sm" disabled={busy} onClick={remove}>{t('common.delete')}</button>}
          </div>
        )}
        {rolling && <Rollover code={y.code} ro={ro} onClose={() => setRolling(false)} onDone={onSaved} />}
      </td>
    </tr>
  );
}

// Annual roll-over: preview what will happen to the previous year's students, then run it.
function Rollover({ code, ro, onClose, onDone }) {
  const { t, L, fmtNum, fmtDate } = useI18n();
  const st = useAsync(() => api.get(`/admin/academic-years/${code}/rollover`), [code]);
  const [result, setResult] = useState(null);
  const [run, busy] = useAction();
  const go = () => run(() => api.post(`/admin/academic-years/${code}/rollover`), t('bo.roll.done')).then((r) => { setResult(r); onDone(); }).catch(() => {});
  return (
    <Modal wide title={t('bo.roll.title', { code })} onClose={onClose}
      footer={!ro && !result && <button className="btn" disabled={busy || !st.data || st.data.totals.roll === 0} onClick={go}>{t('bo.roll.run', { n: fmtNum(st.data?.totals.roll || 0) })}</button>}>
      <Loader state={st}>
        {(p) => {
          const d = result || p;
          return (
            <div className="stack">
              <p className="small">{t('bo.roll.intro', { source: p.source, target: p.target })}</p>
              {result && <div className="alert success small">{t('bo.roll.result', { n: fmtNum(result.created), m: fmtNum(result.notified) })}</div>}
              {!result && p.already_run && <div className="alert info small">{t('bo.roll.already_run')}</div>}
              <div className="grid c4">
                {[['roll', result ? 'bo.roll.created' : 'bo.roll.to_roll'], ['already', 'bo.roll.already'], ['new_school', 'bo.roll.new_school'], ['graduating', 'bo.roll.graduating']].map(([k, lab]) => (
                  <div key={k} className={`stat ${k === 'roll' ? 'accent' : ''}`}><div className="label">{t(lab)}</div><div className="value">{fmtNum(k === 'roll' && result ? result.created : d.totals[k])}</div></div>
                ))}
              </div>
              {d.totals.capacity_missing > 0 && <div className="alert warn small">{t('bo.roll.capacity_missing', { n: fmtNum(d.totals.capacity_missing) })}</div>}
              {d.over_capacity.length > 0 && (
                <div className="alert warn small">
                  <div>{t('bo.roll.over')}<ul style={{ margin: '4px 0 0' }}>{d.over_capacity.map((o) => <li key={o.school_id + o.grade}>{L(o)} · {t(`grade.${o.grade}`)}: {fmtNum(o.after)} / {fmtNum(o.capacity)}</li>)}</ul></div>
                </div>
              )}
              <DataTable rows={d.schools} maxHeight={260} columns={[
                { key: 'school', label: t('common.school'), render: (r) => L(r) },
                { key: 'roll', label: t(result ? 'bo.roll.created' : 'bo.roll.to_roll'), num: true, render: (r) => fmtNum(r.roll) },
                { key: 'already', label: t('bo.roll.already'), num: true, render: (r) => fmtNum(r.already) },
                { key: 'new_school', label: t('bo.roll.new_school'), num: true, render: (r) => fmtNum(r.new_school) },
                { key: 'graduating', label: t('bo.roll.graduating'), num: true, render: (r) => fmtNum(r.graduating) },
              ]} />
              <p className="small muted">{t('bo.roll.after', { code: p.target, open: fmtDate(p.renewal_window?.open_date), close: fmtDate(p.renewal_window?.close_date) })}</p>
            </div>
          );
        }}
      </Loader>
    </Modal>
  );
}

function AddYear({ years, onClose, onDone }) {
  const { t } = useI18n();
  const last = Math.max(...years.map((y) => Number(y.code.slice(0, 4))));
  const n = last + 1;
  const admission = years.find((y) => y.is_admission)?.code || '';
  const [f, setF] = useState({ code: `${n}-${String((n + 1) % 100).padStart(2, '0')}`, start_date: `${n}-08-23`, end_date: `${n + 1}-06-30`, copy_capacity_from: admission });
  const [run, busy] = useAction();
  return (
    <Modal title={t('bo.win.add_year')} onClose={onClose} footer={<button className="btn" disabled={busy} onClick={() => run(() => api.post('/admin/academic-years', f), t('bo.win.year_added')).then(onDone).catch(() => {})}>{t('common.add')}</button>}>
      <div className="form-grid">
        <Field label={t('bo.win.code')} required hint={t('bo.win.code_hint')}><input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} /></Field>
        <Field label={t('bo.win.start')} required><input type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} /></Field>
        <Field label={t('bo.win.end')} required><input type="date" value={f.end_date} onChange={(e) => setF({ ...f, end_date: e.target.value })} /></Field>
        <Field label={t('bo.win.copy_from')} hint={t('bo.win.copy_hint')}>
          <select value={f.copy_capacity_from} onChange={(e) => setF({ ...f, copy_capacity_from: e.target.value })}>
            <option value="">{t('bo.win.copy_none')}</option>
            {years.map((y) => <option key={y.code} value={y.code}>{y.code}</option>)}
          </select>
        </Field>
      </div>
      <p className="small muted mt">{t('bo.win.windows_default')}</p>
    </Modal>
  );
}

export default function Windows() {
  const { t } = useI18n();
  const { lookups, refreshLookups } = useAuth();
  const ro = useReadOnly();
  const st = useAsync(() => api.get('/admin/windows'), []);
  const [adding, setAdding] = useState(false);
  const saved = () => { st.reload(); refreshLookups(); };
  return (
    <>
      <PageHead title={t('nav.windows')} sub={t('bo.win.sub')} reqs={['AD-01', 'BR-14', 'PP-22']} />
      <ReadOnlyNote />
      <Loader state={st}>
        {(d) => (
          <>
            <Card title={t('bo.win.years')} actions={!ro && <button className="btn sm" onClick={() => setAdding(true)}>+ {t('bo.win.add_year')}</button>}>
              <p className="small muted">{t('bo.win.years_hint')}</p>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>{t('common.academic_year')}</th><th>{t('bo.win.start')}</th><th>{t('bo.win.end')}</th><th /><th /></tr></thead>
                  <tbody>{d.years.map((y) => <YearRow key={`${y.code}-${y.start_date}-${y.end_date}-${y.is_current}-${y.is_admission}`} y={y} ro={ro} onSaved={saved} currentCode={d.years.find((x) => x.is_current)?.code || ''} />)}</tbody>
                </table>
              </div>
              <p className="small muted mt">{t('bo.win.rollover_hint')}</p>
              {adding && <AddYear years={d.years} onClose={() => setAdding(false)} onDone={() => { setAdding(false); saved(); }} />}
            </Card>
            <Card title={t('bo.win.windows')}>
              <p className="small muted">{t('bo.win.hint')}</p>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>{t('common.academic_year')}</th><th>{t('bo.win.type')}</th><th>{t('bo.win.opens')}</th><th>{t('bo.win.closes')}</th><th>{t('common.status')}</th><th /></tr></thead>
                  <tbody>{d.windows.map((w) => <WindowRow key={`${w.id}-${w.open_date}-${w.close_date}`} w={w} ro={ro} today={lookups.today} onSaved={saved} />)}</tbody>
                </table>
              </div>
            </Card>
          </>
        )}
      </Loader>
    </>
  );
}
