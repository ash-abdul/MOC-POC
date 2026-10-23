// One student: current placement, next year, leaving request, family and guardians, applications and history.
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { useI18n } from '../../i18n.jsx';
import { useAsync, Loader, Card, Kv, DataTable, StatusBadge } from '../../components/ui.jsx';
import { NextBadge } from './Students.jsx';

export default function StudentDetail() {
  const { id } = useParams();
  const { t, L, fmtDate } = useI18n();
  const { label } = useAuth();
  const nav = useNavigate();
  const st = useAsync(() => api.get(`/school/students/${id}`), [id]);
  const grade = (g) => (g ? t(`grade.${g}`) : '—');

  return (
    <Loader state={st}>
      {(d) => {
        const c = d.child, cur = d.current, nx = d.next;
        return (
          <>
            <div className="page-head">
              <div>
                <h1>{L(c, 'full_name')}</h1>
                <p className="mono">{c.emirates_id}</p>
                <div className="row" style={{ marginTop: 6 }}>
                  <NextBadge s={d.next_year} />
                  {c.sod ? <span className="badge blue">{t('bo.students.sod')}</span> : null}
                </div>
              </div>
              <button className="btn secondary" onClick={() => nav(-1)}>← {t('common.back')}</button>
            </div>

            <div className="grid c2">
              <Card title={t('bo.students.child')}>
                <Kv items={[
                  [t('bo.students.dob'), fmtDate(c.dob)],
                  [t('common.gender'), t(c.gender === 'M' ? 'common.male' : 'common.female')],
                  [t('bo.students.nationality'), label('nationality', c.nationality)],
                  c.passport_no && [t('bo.students.passport'), <span className="mono">{c.passport_no}</span>],
                  [t('bo.students.sod'), c.sod ? t('common.yes') : t('common.no')],
                ]} />
              </Card>

              <Card title={t('bo.students.current', { ay: d.current_ay })}>
                {cur ? (
                  <Kv items={[
                    [t('common.school'), L(cur, 'school')],
                    [t('common.grade'), `${grade(cur.grade)}${cur.section ? ` – ${cur.section}` : ''}`],
                    [t('common.status'), <StatusBadge status={cur.status} />],
                    cur.start_date && [t('bo.students.start'), fmtDate(cur.start_date)],
                  ]} />
                ) : <p className="muted small">{t('bo.students.no_current')}</p>}
              </Card>

              <Card title={t('bo.students.next_card', { ay: d.next_ay })}>
                <p style={{ marginTop: 0 }}><NextBadge s={d.next_year} /></p>
                <p className="small muted">{t(`bo.students.next_help.${d.next_year}`, { default: '' })}</p>
                {nx && (
                  <Kv items={[
                    [t('common.school'), L(nx, 'school')],
                    [t('common.grade'), `${grade(nx.grade)}${nx.section ? ` – ${nx.section}` : ''}`],
                    [t('common.status'), <StatusBadge status={nx.status} />],
                  ]} />
                )}
              </Card>

              {cur && (cur.leave_requested_at || cur.status !== 'enrolled') && (
                <Card title={t('bo.students.leaving')}>
                  <Kv items={[
                    [t('col.reason'), label('leave_reason', cur.leave_reason)],
                    cur.leave_subreason && [t('col.subreason'), label('leave_subreason', cur.leave_subreason)],
                    cur.leave_note && [t('common.note'), cur.leave_note],
                    [t('bo.students.leave_date'), fmtDate(cur.leave_date)],
                    cur.leave_destination && [t('bo.students.destination'), cur.leave_destination],
                    [t('common.status'), cur.status === 'enrolled' ? <span className="badge amber">{t('bo.students.leave_requested')}</span> : <StatusBadge status={cur.status} />],
                  ]} />
                  {cur.status === 'enrolled' && <Link className="btn sm mt" to="/school/leavers">{t('bo.students.confirm_leaver')} →</Link>}
                </Card>
              )}
            </div>

            <Card title={t('bo.students.guardians')} className="mt">
              {d.family ? (
                <>
                  <DataTable rows={d.guardians} columns={[
                    { key: 'name', label: t('bo.students.name'), render: (g) => <><b>{L(g, 'full_name') || '—'}</b> {g.is_primary ? <span className="badge gold">{t('bo.students.first_guardian')}</span> : null} {g.status === 'pending' ? <span className="badge amber">{t('bo.students.pending')}</span> : null}</> },
                    { key: 'rel', label: t('bo.students.relationship'), render: (g) => (g.relationship ? t(`relationship.${g.relationship}`) : '—') },
                    { key: 'eid', label: t('uaepass.eid'), render: (g) => <span className="mono small nowrap">{g.emirates_id}</span> },
                    { key: 'contact', label: t('bo.students.contact'), render: (g) => <span className="small">{g.mobile || '—'}<br />{g.email || ''}</span> },
                    { key: 'channel', label: t('bo.students.channel'), render: (g) => (g.preferred_channel ? t(`channel.${g.preferred_channel}`) : '—') },
                  ]} />
                  <div className="mt">
                    <Kv items={[
                      [t('bo.students.home'), `${L(d.family, 'area') || '—'}${d.family.emirate ? ` · ${d.family.emirate}` : ''}`],
                      d.family.makani && [t('bo.students.makani'), <span className="mono">{d.family.makani}</span>],
                      d.family.emergency_name && [t('bo.students.emergency'), `${d.family.emergency_name}${d.family.emergency_relationship ? ` (${t(`relationship.${d.family.emergency_relationship}`)})` : ''} · ${d.family.emergency_mobile || ''}`],
                      [t('bo.students.sole_custody'), d.family.sole_custody ? t('common.yes') : t('common.no')],
                    ]} />
                  </div>
                  {d.siblings.length > 0 && (
                    <>
                      <h4 className="mt">{t('bo.students.siblings')}</h4>
                      <div className="row">{d.siblings.map((s) => <Link key={s.id} to={`/school/students/${s.id}`} className="badge wrap">{L(s, 'full_name')}{s.grade ? ` · ${grade(s.grade)} · ${L(s, 'school')}` : ''}</Link>)}</div>
                    </>
                  )}
                </>
              ) : <p className="small muted">{t('bo.students.no_family')}</p>}
            </Card>

            <Card title={t('bo.students.applications')} className="mt">
              <DataTable rows={d.applications} empty={t('bo.students.no_apps')} onRowClick={(a) => nav(`/school/applications/${a.id}`)} columns={[
                { key: 'ref', label: t('col.ref'), render: (a) => <span className="mono small nowrap">{a.ref}</span> },
                { key: 'type', label: t('col.type'), render: (a) => t(`type.${a.type}`) },
                { key: 'ay', label: t('common.academic_year'), render: (a) => a.ay },
                { key: 'grade', label: t('common.grade'), render: (a) => grade(a.grade) },
                { key: 'school', label: t('common.school'), render: (a) => <span className="small">{L(a, 'school')}</span> },
                { key: 'status', label: t('common.status'), render: (a) => <StatusBadge status={a.status} /> },
              ]} />
            </Card>

            <Card title={t('bo.students.history')} className="mt">
              <DataTable rows={d.history} columns={[
                { key: 'ay', label: t('common.academic_year'), render: (e) => <b>{e.ay}</b> },
                { key: 'school', label: t('common.school'), render: (e) => L(e, 'school') },
                { key: 'grade', label: t('common.grade'), render: (e) => `${grade(e.grade)}${e.section ? ` – ${e.section}` : ''}` },
                { key: 'status', label: t('common.status'), render: (e) => <StatusBadge status={e.status} /> },
                { key: 'source', label: t('bo.students.source'), render: (e) => <span className="small muted">{e.source ? t(`bo.students.src.${e.source}`, { default: e.source }) : '—'}</span> },
              ]} />
            </Card>
          </>
        );
      }}
    </Loader>
  );
}
