// Insights dashboard (section 4.4, CC-07): live KPIs, capacity alerts and links into each report.
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { useI18n } from '../../i18n.jsx';
import { useAsync, PageHead, Card, Loader, Stat, DataTable, CapacityBar, Empty } from '../../components/ui.jsx';
import Bars from '../../components/Bars.jsx';
import { makeCell } from '../../components/reportFormat.js';

const STATUS_ORDER = ['submitted', 'under_review', 'info_requested', 'passed', 'escalated', 'offer_made', 'accepted', 'rejected', 'withdrawn', 'lapsed', 'closed'];

export default function Dashboard() {
  const { t, L, lang, fmtNum, fmtDate, fmtDateTime } = useI18n();
  const { me } = useAuth();
  const st = useAsync(() => api.get('/reports/dashboard'), []);
  const cell = makeCell({ t, lang, fmtNum, fmtDate, fmtDateTime });
  const scope = ['registrar', 'principal'].includes(me.role) ? t('ins.scope_school', { school: L(me.school) }) : me.role === 'cluster_officer' ? t('ins.scope_cluster', { cluster: L(me.cluster) }) : t('ins.scope_all');

  return (
    <Loader state={st}>
      {(d) => {
        const a = d.applications;
        const full = d.alerts.filter((x) => x.level >= 100);
        const warn = d.alerts.filter((x) => x.level < 100);
        const used = d.capacity.enrolled + d.capacity.held + d.capacity.offered;
        const kpi = (to, label, value, sub, accent) => (
          <Link to={to} style={{ color: 'inherit', textDecoration: 'none' }} title={t('ins.open_report')}>
            <Stat label={label} value={value} sub={sub} accent={accent} />
          </Link>
        );
        const byStatus = STATUS_ORDER.map((s) => ({ status: s, n: d.by_status.find((x) => x.status === s)?.n || 0 })).filter((x) => x.n);
        const alertRows = (rows) => (
          <DataTable rows={rows} maxHeight={300} empty={t('ins.alerts_none')}
            columns={[
              { key: 'school', label: t('col.school'), render: (r) => cell(r, 'school') },
              { key: 'ay', label: t('col.ay') },
              { key: 'grade', label: t('col.grade'), render: (r) => cell(r, 'grade') },
              { key: 'utilisation', label: t('col.utilisation'), num: true, render: (r) => cell(r, 'utilisation') },
              { key: 'reached_at', label: t('ins.reached'), render: (r) => <span className="small nowrap">{fmtDate(r.reached_at)}</span> },
            ]} />
        );
        return (
          <>
            <PageHead title={t('ins.dashboard_title')} sub={`${t('ins.dashboard_sub', { ay: d.ay })} ${scope}`} reqs={['4.4', 'CC-07', 'IR-05']}>
              <Link className="btn secondary" to="/insights/reports">{t('nav.reports')} →</Link>
            </PageHead>

            <div className="grid c4">
              {kpi('/insights/reports/IR-01', t('ins.kpi.applications'), fmtNum(a.total), null, true)}
              {kpi('/insights/reports/IR-01', t('ins.kpi.pending'), fmtNum(a.pending))}
              {kpi('/insights/reports/IR-01', t('ins.kpi.offers'), fmtNum(a.offered))}
              {kpi('/insights/reports/IR-02', t('ins.kpi.accepted'), fmtNum(a.accepted))}
              {kpi('/insights/reports/IR-06', t('ins.kpi.escalated'), fmtNum(a.escalated))}
              {kpi('/insights/reports/IR-09', t('ins.kpi.overdue'), fmtNum(d.sla.overdue), t('ins.kpi.within_sla', { pct: fmtNum(d.sla.within_sla_pct, 1) }))}
              {kpi('/insights/reports/IR-04', t('ins.kpi.utilisation'), `${fmtNum(d.capacity.utilisation, 1)}%`, t('ins.kpi.seats', { used: fmtNum(used), cap: fmtNum(d.capacity.capacity) }))}
              {kpi('/insights/reports/IR-05', t('ins.kpi.alerts'), fmtNum(d.alerts.length), t('ins.kpi.alerts_sub', { full: full.length, warn: warn.length, threshold: d.warning_threshold }))}
              {kpi('/insights/reports/IR-07', t('ins.kpi.leavers'), fmtNum(d.leavers_total))}
            </div>

            <Card className="mt" title={t('ins.alerts_title')} actions={<Link to="/insights/reports/IR-05">{t('ins.open_report')} →</Link>}
              style={{ borderTop: full.length ? '4px solid var(--red-600)' : '4px solid var(--amber-500)' }}>
              <p className="small muted">{t('ins.alerts_note', { threshold: d.warning_threshold })}</p>
              <div className="grid c2">
                <div>
                  <h4 className="row"><span className="badge red">100%</span> {t('ins.alerts_full')} ({full.length})</h4>
                  {alertRows(full)}
                </div>
                <div>
                  <h4 className="row"><span className="badge amber">≥{d.warning_threshold}%</span> {t('ins.alerts_warn')} ({warn.length})</h4>
                  {alertRows(warn)}
                </div>
              </div>
            </Card>

            <div className="grid c2 mt">
              <Card title={t('ins.util_by_school')} actions={<Link to="/insights/reports/IR-04?by=school">{t('ins.open_report')} →</Link>}>
                <Bars data={d.capacity.schools} x="school" xLabel={(r) => cell(r, 'school')} series={[{ key: 'utilisation', label: t('col.utilisation') }]}
                  threshold={d.warning_threshold} valueSuffix="%" height={260} />
                <div className="small muted">{t('ins.threshold_line')}</div>
              </Card>
              <Card title={t('ins.by_status')} actions={<Link to="/insights/reports/IR-01">{t('ins.open_report')} →</Link>}>
                {byStatus.length ? (
                  <Bars data={byStatus} x="status" xLabel={(r) => t(`status.${r.status}`)} series={[{ key: 'n', label: t('ins.count') }]} height={260} />
                ) : <Empty />}
              </Card>
            </div>

            <div className="grid c2 mt">
              <Card title={`${t('ins.overdue_title')} (${fmtNum(d.sla.overdue)})`} actions={<Link to="/insights/reports/IR-09">{t('ins.open_report')} →</Link>}>
                <DataTable rows={d.sla.overdue_list} empty={t('ins.overdue_none')}
                  columns={[
                    { key: 'ref', label: t('col.ref'), render: (r) => <span className="mono small">{r.ref}</span> },
                    { key: 'school', label: t('col.school'), render: (r) => cell(r, 'school') },
                    { key: 'grade', label: t('col.grade'), render: (r) => cell(r, 'grade') },
                    { key: 'sla_due_at', label: t('ins.due'), render: (r) => <span className="badge red">{cell(r, 'sla_due_at')}</span> },
                  ]} />
              </Card>
              <Card title={t('ins.leavers_by_reason')} actions={<Link to="/insights/reports/IR-07">{t('ins.open_report')} →</Link>}>
                <DataTable rows={d.leavers} footer={{ reason: t('col.total'), leavers: fmtNum(d.leavers_total) }}
                  columns={[
                    { key: 'reason', label: t('col.reason'), render: (r) => cell(r, 'reason') },
                    { key: 'leavers', label: t('col.leavers'), num: true, render: (r) => fmtNum(r.leavers) },
                    { key: 'male', label: t('col.male'), num: true, render: (r) => fmtNum(r.male) },
                    { key: 'female', label: t('col.female'), num: true, render: (r) => fmtNum(r.female) },
                  ]} />
              </Card>
            </div>

            <Card className="mt" title={t('ins.transport_title')} actions={<Link to="/insights/reports/IR-10">{t('ins.open_report')} →</Link>}>
              <DataTable rows={d.transport}
                columns={[
                  { key: 'route', label: t('col.route'), render: (r) => cell(r, 'route') },
                  { key: 'capacity', label: t('col.capacity'), num: true, render: (r) => fmtNum(r.capacity) },
                  { key: 'requests', label: t('col.requests'), num: true, render: (r) => fmtNum(r.requests) },
                  { key: 'confirmed', label: t('col.confirmed'), num: true, render: (r) => fmtNum(r.confirmed) },
                  { key: 'waitlisted', label: t('col.waitlisted'), num: true, render: (r) => (r.waitlisted ? <span className="badge amber">{fmtNum(r.waitlisted)}</span> : '0') },
                  { key: 'utilisation', label: t('col.utilisation'), render: (r) => <div className="row" style={{ gap: 8, minWidth: 140 }}><div style={{ flex: 1 }}><CapacityBar pct={r.utilisation} threshold={d.warning_threshold} /></div><span className="small">{cell(r, 'utilisation')}</span></div> },
                ]} />
            </Card>
            <p className="small muted mt">{t('ins.live_note')}</p>
          </>
        );
      }}
    </Loader>
  );
}
