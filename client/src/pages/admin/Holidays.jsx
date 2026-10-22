// AD-04: working-day calendar (Mon–Fri) with UAE public holidays.
import { useState } from 'react';
import { api } from '../../api.js';
import { useI18n } from '../../i18n.jsx';
import { useAsync, useAction, PageHead, Loader, Card, DataTable, Field } from '../../components/ui.jsx';
import { useReadOnly, ReadOnlyNote } from '../../components/AdminBits.jsx';

export default function Holidays() {
  const { t, L, fmtDate } = useI18n();
  const ro = useReadOnly();
  const st = useAsync(() => api.get('/admin/holidays'), []);
  const [f, setF] = useState({ date: '', name_en: '', name_ar: '' });
  const [run, busy] = useAction();
  const add = () => run(() => api.post('/admin/holidays', f), t('common.saved')).then(() => { setF({ date: '', name_en: '', name_ar: '' }); st.reload(); }).catch(() => {});
  const del = (d) => run(() => api.del(`/admin/holidays/${d}`), t('common.saved')).then(st.reload).catch(() => {});
  return (
    <>
      <PageHead title={t('nav.holidays')} sub={t('bo.hol.sub')} reqs={['AD-04', 'BR-06', 'BR-07', 'BR-08']} />
      <ReadOnlyNote />
      {!ro && (
        <Card title={t('bo.hol.add')}>
          <div className="form-grid">
            <Field label={t('common.date')} required><input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
            <Field label={t('bo.lists.label_en')} required><input value={f.name_en} onChange={(e) => setF({ ...f, name_en: e.target.value })} /></Field>
            <Field label={t('bo.lists.label_ar')} required><input dir="rtl" value={f.name_ar} onChange={(e) => setF({ ...f, name_ar: e.target.value })} /></Field>
          </div>
          <button className="btn mt" disabled={busy || !f.date || !f.name_en || !f.name_ar} onClick={add}>{t('common.add')}</button>
        </Card>
      )}
      <Card title={t('bo.hol.list')} className="mt">
        <p className="small muted">{t('bo.hol.note')}</p>
        <Loader state={st}>
          {(rows) => (
            <DataTable rows={rows} columns={[
              { key: 'date', label: t('common.date'), render: (h) => <span className="nowrap">{fmtDate(h.date)} <span className="muted small">({t(`bo.day.${new Date(h.date + 'T00:00:00Z').getUTCDay()}`)})</span></span> },
              { key: 'name', label: t('bo.hol.name'), render: (h) => L(h) },
              ...(ro ? [] : [{ key: 'x', label: '', render: (h) => <button className="btn ghost sm" disabled={busy} onClick={() => del(h.date)}>{t('common.delete')}</button> }]),
            ]} />
          )}
        </Loader>
      </Card>
    </>
  );
}
