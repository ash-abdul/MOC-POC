// SB-09 / TR-04: audit log of all changes and decisions, exportable to Excel.
import { useState } from 'react';
import { api, qs, download } from '../../api.js';
import { useI18n } from '../../i18n.jsx';
import { useAsync, useAction, PageHead, Loader, Card, DataTable } from '../../components/ui.jsx';

const short = (s) => {
  if (!s) return '';
  return s.length > 140 ? s.slice(0, 140) + '…' : s;
};

export default function Audit() {
  const { t, lang, fmtDateTime } = useI18n();
  const [f, setF] = useState({ from: '', to: '', action: '', user: '', entity: '' });
  const [applied, setApplied] = useState(f);
  const st = useAsync(() => api.get(`/admin/audit${qs(applied)}`), [JSON.stringify(applied)]);
  const [run, busy] = useAction();
  const [open, setOpen] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <>
      <PageHead title={t('nav.audit')} sub={t('bo.audit.sub')} reqs={['SB-09', 'TR-04', 'CC-06', 'A13']}>
        <button className="btn secondary" disabled={busy} onClick={() => run(() => download(`/admin/audit/export${qs({ ...applied, lang })}`, `audit-log-${lang}.xlsx`))}>⬇ {t('common.export_excel')}</button>
      </PageHead>
      <Card className="mb">
        <div className="form-grid">
          <label className="field"><span>{t('common.from')}</span><input type="date" value={f.from} onChange={set('from')} /></label>
          <label className="field"><span>{t('common.to')}</span><input type="date" value={f.to} onChange={set('to')} /></label>
          <label className="field"><span>{t('col.action')}</span><input value={f.action} onChange={set('action')} placeholder="application.offer_made" /></label>
          <label className="field"><span>{t('col.user_name')}</span><input value={f.user} onChange={set('user')} /></label>
          <label className="field"><span>{t('col.entity')}</span><input value={f.entity} onChange={set('entity')} placeholder="ADM-2026-…" /></label>
        </div>
        <div className="row mt">
          <button className="btn" onClick={() => setApplied(f)}>{t('common.filter')}</button>
          <button className="btn secondary" onClick={() => { const e = { from: '', to: '', action: '', user: '', entity: '' }; setF(e); setApplied(e); }}>{t('common.reset')}</button>
          <span className="small muted">{t('bo.audit.limit')}</span>
        </div>
      </Card>
      <Loader state={st}>
        {(rows) => (
          <DataTable rows={rows} maxHeight="65vh" onRowClick={(r) => setOpen(open === r.id ? null : r.id)} columns={[
            { key: 'at', label: t('col.at'), render: (r) => <span className="small nowrap">{fmtDateTime(r.at)}</span> },
            { key: 'user', label: t('col.user_name'), render: (r) => <>{r.user_name}<div className="small muted">{t(`role.${r.role}`, { default: r.role })}</div></> },
            { key: 'action', label: t('col.action'), render: (r) => <code className="small">{r.action}</code> },
            { key: 'entity', label: t('col.entity'), render: (r) => <span className="small">{r.entity} <span className="mono">{r.entity_id}</span></span> },
            { key: 'change', label: `${t('col.prev_value')} → ${t('col.new_value')}`, render: (r) => (
              <div className="small mono" style={{ maxWidth: 520, whiteSpace: open === r.id ? 'pre-wrap' : 'normal', wordBreak: 'break-word' }}>
                {r.prev_value && <div style={{ color: 'var(--red-700)' }}>− {open === r.id ? r.prev_value : short(r.prev_value)}</div>}
                {r.new_value && <div style={{ color: 'var(--green-700)' }}>+ {open === r.id ? r.new_value : short(r.new_value)}</div>}
              </div>
            ) },
            { key: 'reason', label: t('col.reason'), render: (r) => <span className="small">{r.reason}</span> },
          ]} />
        )}
      </Loader>
    </>
  );
}
