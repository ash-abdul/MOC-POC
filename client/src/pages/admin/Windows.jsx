// AD-01: academic years and the new-registration / renewal / transfer windows.
import { useState } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { useI18n } from '../../i18n.jsx';
import { useAsync, useAction, PageHead, Loader, Card, DataTable } from '../../components/ui.jsx';
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

export default function Windows() {
  const { t, fmtDate } = useI18n();
  const { lookups, refreshLookups } = useAuth();
  const ro = useReadOnly();
  const st = useAsync(() => api.get('/admin/windows'), []);
  return (
    <>
      <PageHead title={t('nav.windows')} sub={t('bo.win.sub')} reqs={['AD-01', 'BR-14', 'PP-22']} />
      <ReadOnlyNote />
      <Loader state={st}>
        {(d) => (
          <>
            <Card title={t('bo.win.years')}>
              <DataTable rows={d.years} columns={[
                { key: 'code', label: t('common.academic_year'), render: (y) => <b>{y.code}</b> },
                { key: 'start', label: t('bo.win.start'), render: (y) => fmtDate(y.start_date) },
                { key: 'end', label: t('bo.win.end'), render: (y) => fmtDate(y.end_date) },
                { key: 'role', label: '', render: (y) => <>{y.is_current ? <span className="badge blue">{t('bo.win.current')}</span> : null} {y.is_admission ? <span className="badge gold">{t('bo.win.admission')}</span> : null}</> },
              ]} />
            </Card>
            <Card title={t('bo.win.windows')}>
              <p className="small muted">{t('bo.win.hint')}</p>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>{t('common.academic_year')}</th><th>{t('bo.win.type')}</th><th>{t('bo.win.opens')}</th><th>{t('bo.win.closes')}</th><th>{t('common.status')}</th><th /></tr></thead>
                  <tbody>{d.windows.map((w) => <WindowRow key={`${w.id}-${w.open_date}-${w.close_date}`} w={w} ro={ro} today={lookups.today} onSaved={() => { st.reload(); refreshLookups(); }} />)}</tbody>
                </table>
              </div>
            </Card>
          </>
        )}
      </Loader>
    </>
  );
}
