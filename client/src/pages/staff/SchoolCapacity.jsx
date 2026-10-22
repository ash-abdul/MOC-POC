// CC-02 / CC-04 / CC-07: live seats for the user's own school. No force-registration option here (A7).
import { useState, Fragment } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { useI18n } from '../../i18n.jsx';
import { useAsync, PageHead, Loader, Card, CapacityBar, Stat, SeatBadge } from '../../components/ui.jsx';

export function GradeSeatsTable({ grades, threshold = 90 }) {
  const { t, fmtNum } = useI18n();
  const [open, setOpen] = useState({});
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>{t('common.grade')}</th><th className="num">{t('bo.cap.sections')}</th><th className="num">{t('col.capacity')}</th><th className="num">{t('col.enrolled')}</th>
            <th className="num">{t('col.held')}</th><th className="num">{t('col.offered')}</th><th className="num">{t('col.available')}</th><th style={{ minWidth: 140 }}>{t('col.utilisation')}</th><th />
          </tr>
        </thead>
        <tbody>
          {grades.map((g) => (
            <Fragment key={g.grade}>
              <tr className="clickable" onClick={() => setOpen((o) => ({ ...o, [g.grade]: !o[g.grade] }))}>
                <td><b>{t(`grade.${g.grade}`)}</b> <span className="muted small">{open[g.grade] ? '▾' : '▸'}</span></td>
                <td className="num">{g.sections.length}</td>
                <td className="num">{g.capacity}</td><td className="num">{g.enrolled}</td><td className="num">{g.held}</td><td className="num">{g.offered}</td>
                <td className="num"><b>{g.available}</b></td>
                <td><div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}><div style={{ flex: 1 }}><CapacityBar pct={g.utilisation} threshold={threshold} /></div><span className="small nowrap">{fmtNum(g.utilisation, 1)}%</span></div></td>
                <td>{g.closed ? <span className="badge red">{t('bo.cap.closed')}</span> : <SeatBadge status={g.status} />}</td>
              </tr>
              {open[g.grade] && g.sections.map((s) => (
                <tr key={s.id} style={{ background: 'var(--black-50)' }}>
                  <td className="small" style={{ paddingInlineStart: 28 }}>{t('common.section')} {s.name}</td><td />
                  <td className="num small">{s.capacity}</td><td className="num small">{s.enrolled}</td><td className="num small">{s.held}</td><td className="num small">{s.offered}</td>
                  <td className="num small">{s.available}</td>
                  <td><CapacityBar pct={s.utilisation} threshold={threshold} /></td><td />
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function SchoolCapacity() {
  const { t, L, fmtNum, fmtDate } = useI18n();
  const { me, lookups } = useAuth();
  const [ay, setAy] = useState(lookups.admission_ay.code);
  const st = useAsync(() => api.get(`/schools/${me.school.id}/capacity?ay=${ay}`), [ay]);
  const threshold = lookups.settings.capacity_warning_threshold;
  return (
    <>
      <PageHead title={t('nav.school_capacity')} sub={L(me.school)} reqs={['CC-02', 'CC-04', 'CC-07']}>
        <select value={ay} onChange={(e) => setAy(e.target.value)} style={{ width: 'auto' }}>
          {[lookups.current_ay.code, lookups.admission_ay.code].map((y) => <option key={y} value={y}>{t('common.academic_year')} {y}</option>)}
        </select>
      </PageHead>
      <Loader state={st}>
        {(d) => (
          <>
            <div className="grid c4 mb">
              <Stat accent label={t('col.capacity')} value={fmtNum(d.capacity)} />
              <Stat label={t('col.enrolled')} value={fmtNum(d.enrolled)} sub={`${t('col.held')}: ${fmtNum(d.held)} · ${t('col.offered')}: ${fmtNum(d.offered)}`} />
              <Stat label={t('col.available')} value={fmtNum(d.available)} />
              <Stat label={t('col.utilisation')} value={`${fmtNum(d.utilisation, 1)}%`} />
            </div>
            {d.alerts.length > 0 && (
              <div className="stack mb">
                {d.alerts.map((a) => (
                  <div key={a.id} className={`alert ${a.level >= 100 ? 'error' : 'warn'}`}>
                    <b>{a.grade ? t(`grade.${a.grade}`) : t('val.ALL')}</b>: {t(a.level >= 100 ? 'bo.cap.alert_full' : 'bo.cap.alert_warn', { level: a.level, pct: fmtNum(a.utilisation, 1) })} · {fmtDate(a.reached_at)}
                  </div>
                ))}
              </div>
            )}
            <Card title={t('bo.cap.by_grade')}>
              <p className="small muted">{t('bo.cap.legend')}</p>
              <GradeSeatsTable grades={d.grades} threshold={threshold} />
            </Card>
          </>
        )}
      </Loader>
    </>
  );
}
