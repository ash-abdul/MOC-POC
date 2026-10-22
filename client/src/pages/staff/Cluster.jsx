// SB-07: cluster office – escalations, overdue applications and the cluster capacity matrix.
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { useI18n } from '../../i18n.jsx';
import { useAsync, PageHead, Loader, Card, DataTable, Stat } from '../../components/ui.jsx';

const cellColor = (pct, warn) => (pct >= 100 ? 'var(--red-100)' : pct >= warn ? 'var(--amber-100)' : pct >= 75 ? 'var(--green-50)' : '#fff');

export default function Cluster() {
  const { t, L, fmtDate, fmtNum } = useI18n();
  const { lookups } = useAuth();
  const nav = useNavigate();
  const st = useAsync(() => api.get('/cluster/overview'), []);
  const warn = lookups.settings.capacity_warning_threshold;
  return (
    <Loader state={st}>
      {(d) => (
        <>
          <PageHead title={t('nav.cluster')} sub={`${L(d.cluster)} · ${t('common.academic_year')} ${d.ay}`} reqs={['SB-07', 'SB-06', 'PP-22', 'A5', 'A14']} />
          <div className="grid c3 mb">
            <Stat accent label={t('bo.cluster.escalated')} value={d.escalated.length} />
            <Stat label={t('bo.cluster.overdue')} value={d.overdue.length} />
            <Stat label={t('bo.cluster.schools')} value={d.schools.length} />
          </div>
          <Card title={t('bo.cluster.escalated')}>
            <DataTable rows={d.escalated} onRowClick={(r) => nav(`/school/applications/${r.id}`)} empty={t('bo.cluster.none')} columns={[
              { key: 'ref', label: t('col.ref'), render: (r) => <span className="mono small">{r.ref}</span> },
              { key: 'child', label: t('bo.child'), render: (r) => <>{L(r, 'child')} {r.sod ? <span className="badge gold">{t('bo.flag.sod_short')}</span> : null}</> },
              { key: 'grade', label: t('common.grade'), render: (r) => t(`grade.${r.grade}`) },
              { key: 'school', label: t('bo.cluster.current_school'), render: (r) => L(r, 'school') },
              { key: 'reason', label: t('col.reason'), render: (r) => <span className="badge amber">{t(`escalation.${r.escalation_reason}`, { default: r.escalation_reason || '—' })}</span> },
              { key: 'prefs', label: t('bo.cluster.prefs'), num: true, render: (r) => r.preferences.length },
              { key: 'sub', label: t('col.submitted'), render: (r) => fmtDate(r.submitted_at) },
            ]} />
          </Card>
          <Card title={t('bo.cluster.overdue')}>
            <DataTable rows={d.overdue} onRowClick={(r) => nav(`/school/applications/${r.id}`)} empty={t('bo.cluster.none')} maxHeight={300} columns={[
              { key: 'ref', label: t('col.ref'), render: (r) => <span className="mono small">{r.ref}</span> },
              { key: 'school', label: t('common.school'), render: (r) => L(r, 'school') },
              { key: 'grade', label: t('common.grade'), render: (r) => t(`grade.${r.grade}`) },
              { key: 'due', label: t('bo.cluster.due'), render: (r) => <span className="badge red">{fmtDate(r.sla_due_at)}</span> },
            ]} />
          </Card>
          <Card title={t('bo.cluster.matrix')}>
            <p className="small muted">{t('bo.cluster.matrix_hint', { warn })}</p>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>{t('common.school')}</th>{lookups.grades.map((g) => <th key={g} className="num">{g}</th>)}<th className="num">{t('col.utilisation')}</th></tr></thead>
                <tbody>
                  {d.schools.map((s) => (
                    <tr key={s.id}>
                      <td className="nowrap">{L(s)}</td>
                      {lookups.grades.map((g) => {
                        const gr = s.grades.find((x) => x.grade === g);
                        return <td key={g} className="num small" style={{ background: gr ? cellColor(gr.utilisation, warn) : 'var(--black-50)' }} title={gr ? `${gr.used}/${gr.capacity}` : ''}>{gr ? `${gr.available}` : ''}</td>;
                      })}
                      <td className="num"><b>{fmtNum(s.utilisation, 1)}%</b></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="small muted">{t('bo.cluster.cells')}</p>
          </Card>
        </>
      )}
    </Loader>
  );
}
