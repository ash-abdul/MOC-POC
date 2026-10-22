// Demo controls: move the demo clock and run the scheduled jobs (SLA reminders, offer lapse,
// information-request expiry, leaving-date seat release) on demand.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { useI18n } from '../../i18n.jsx';
import { useAction, PageHead, Card, Kv, ReqTag } from '../../components/ui.jsx';

const SCENARIOS = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10', 'A11', 'A12', 'A13', 'A14', 'A15', 'A16'];

export default function Demo() {
  const { t } = useI18n();
  const { lookups, refreshLookups } = useAuth();
  const [days, setDays] = useState(lookups.clock_offset_days || 0);
  const [result, setResult] = useState(null);
  const [run, busy] = useAction();
  const show = (r) => setResult(r.jobs || r);
  return (
    <>
      <PageHead title={t('nav.demo')} sub={t('bo.demo.sub')} reqs={['SB-06', 'BR-07', 'BR-08', 'SB-08']} />
      <div className="grid c2" style={{ alignItems: 'start' }}>
        <Card title={t('bo.demo.clock')}>
          <p className="small">{t('bo.demo.clock_text')}</p>
          <Kv items={[[t('bo.demo.today'), <b>{lookups.today}</b>], [t('bo.demo.offset'), `${lookups.clock_offset_days} ${t('common.days')}`]]} />
          <div className="row mt">
            <input type="number" style={{ width: 110 }} value={days} onChange={(e) => setDays(e.target.value)} />
            <button className="btn" disabled={busy} onClick={() => run(() => api.put('/admin/clock', { offsetDays: Number(days) }), t('common.saved')).then((r) => { show(r); refreshLookups(); }).catch(() => {})}>{t('bo.demo.set_clock')}</button>
            <button className="btn secondary" disabled={busy} onClick={() => { setDays(0); run(() => api.put('/admin/clock', { offsetDays: 0 }), t('common.saved')).then((r) => { show(r); refreshLookups(); }).catch(() => {}); }}>{t('bo.demo.reset_clock')}</button>
          </div>
          <div className="alert warn small mt">{t('bo.demo.clock_warn')}</div>
        </Card>
        <Card title={t('bo.demo.jobs')}>
          <p className="small">{t('bo.demo.jobs_text')}</p>
          <button className="btn" disabled={busy} onClick={() => run(() => api.post('/admin/jobs/run'), t('bo.demo.jobs_done')).then(show).catch(() => {})}>{t('bo.demo.run_jobs')}</button>
          {result && (
            <div className="mt">
              <Kv items={Object.entries(result).map(([k, v]) => [t(`bo.demo.job.${k}`, { default: k }), <b>{v}</b>])} />
            </div>
          )}
        </Card>
      </div>
      <Card title={t('bo.demo.personas')} className="mt">
        <p className="small muted">{t('bo.demo.personas_text')}</p>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>{t('bo.demo.scenario')}</th><th>{t('bo.demo.how')}</th></tr></thead>
            <tbody>{SCENARIOS.map((s) => <tr key={s}><td><ReqTag id={s} /></td><td className="small">{t(`bo.demo.sc.${s}`)}</td></tr>)}</tbody>
          </table>
        </div>
        <p className="small mt"><Link to="/docs">{t('nav.docs')} →</Link></p>
      </Card>
    </>
  );
}
