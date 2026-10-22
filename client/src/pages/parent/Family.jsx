// Family dashboard (PP-02, PP-05, PP-06, PP-09, PP-18, PP-19, PP-20, PP-21).
import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useI18n } from '../../i18n.jsx';
import { useAuth } from '../../auth.jsx';
import { useAsync, Loader, PageHead, Card, StatusBadge, Empty } from '../../components/ui.jsx';
import { EligibleText, ActionBanner, PathwayModal, gradeLabel } from './shared.jsx';

export default function Family() {
  const { t, L, fmtDate } = useI18n();
  const { me } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const st = useAsync(() => api.get('/family'), []);
  const [applyFor, setApplyFor] = useState(null);
  if (!me.familyId && me.invites?.length) return <Navigate to="/parent/link" replace />;

  return (
    <>
      <PageHead title={t('parent.family.title')} sub={t('parent.family.sub')} reqs={['PP-02', 'PP-05', 'PP-06', 'PP-20']}>
        <Link className="btn" to="/parent/children/new">+ {t('parent.family.add_child')}</Link>
      </PageHead>
      <Loader state={st}>
        {(d) => {
          const pendingGuardians = d.guardians.filter((g) => g.status === 'pending');
          const activeApps = d.children.map((c) => c.active_application).filter((a) => a && ['offer_made', 'info_requested'].includes(a.status));
          return (
            <>
              {params.get('welcome') && (
                <div className="alert success mb">
                  <div>
                    <b>{t('parent.family.welcome_title', { name: L(me) })}</b>
                    <div className="small">{t('parent.family.welcome_text')}</div>
                  </div>
                </div>
              )}
              {!d.family.residence_confirmed && (
                <div className="alert warn mb">
                  <div style={{ flex: 1 }}>{t('parent.family.no_home')}</div>
                  <Link className="btn sm" to="/parent/home-location">{t('parent.family.set_home')}</Link>
                </div>
              )}
              {activeApps.map((a) => (
                <div key={a.id} className="mb"><ActionBanner app={a} onOpen={() => nav(`/parent/applications/${a.id}`)} /></div>
              ))}

              <div className="grid c3 mb">
                <Card title={t('parent.family.guardians')}>
                  {d.guardians.map((g) => (
                    <div key={g.id} className="row between small" style={{ padding: '4px 0' }}>
                      <span>
                        <b>{g.status === 'active' ? L(g, 'full_name') : g.emirates_id}</b>
                        <span className="muted"> · {t(`relationship.${g.relationship || 'guardian'}`)}</span>
                      </span>
                      {g.is_primary ? <span className="badge gold">{t('parent.family.primary')}</span> : g.status === 'pending' ? <span className="badge amber">{t('parent.family.pending_uaepass')}</span> : <span className="badge green">{t('parent.family.linked')}</span>}
                    </div>
                  ))}
                  {d.family.sole_custody ? <div className="small muted mt">{t('parent.family.sole_custody')}</div> : null}
                  {pendingGuardians.length === 0 && d.guardians.length < 2 && !d.family.sole_custody && (
                    <Link className="small" to="/parent/profile">{t('parent.family.add_guardian')} →</Link>
                  )}
                </Card>
                <Card title={t('parent.family.home')}>
                  {d.family.residence_confirmed ? (
                    <div className="small">
                      <div><b>{L(d.family, 'area')}</b> · {d.family.emirate}</div>
                      <div className="muted">{t('parent.home.makani')}: <span className="mono">{d.family.makani}</span></div>
                    </div>
                  ) : <div className="small muted">{t('parent.family.no_home_short')}</div>}
                  <Link className="small" to="/parent/home-location">{t('parent.family.change_home')} →</Link>
                </Card>
                <Card title={t('parent.family.windows')}>
                  {['new', 'renewal', 'transfer'].map((w) => (
                    <div key={w} className="row between small" style={{ padding: '3px 0' }}>
                      <span>{t(`parent.window.${w}`)}</span>
                      <span className={`badge ${d.windows[w].open ? 'green' : ''}`}>
                        {d.windows[w].open ? t('parent.window.open_until', { date: fmtDate(d.windows[w].window.close_date) }) : t('parent.window.closed_opens', { date: fmtDate(d.windows[w].window?.open_date) })}
                      </span>
                    </div>
                  ))}
                  <div className="small muted mt">{t('parent.family.admission_ay', { ay: d.admission_ay })}</div>
                </Card>
              </div>

              <h2>{t('parent.family.children')}</h2>
              {d.children.length === 0 && <Empty>{t('parent.family.no_children')}</Empty>}
              <div className="grid c2">
                {d.children.map((c) => <ChildCard key={c.id} c={c} siblings={d.children.filter((x) => x.id !== c.id)} onApply={() => setApplyFor(c)} />)}
              </div>
            </>
          );
        }}
      </Loader>
      {applyFor && <PathwayModal child={applyFor} onClose={() => setApplyFor(null)} />}
    </>
  );
}

function ChildCard({ c, siblings, onApply }) {
  const { t, L, fmtDate, lang } = useI18n();
  const nav = useNavigate();
  const active = c.active_application;
  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h3 style={{ marginBottom: 2 }}>{L(c, 'full_name')}</h3>
          <div className="small muted">
            <span className="mono">{c.emirates_id}</span> · {fmtDate(c.dob)} · {c.gender === 'M' ? t('common.male') : t('common.female')}
            {c.sod ? <> · <span className="badge blue">{t('parent.child.sod')}</span></> : null}
          </div>
        </div>
      </div>
      <div className="stack small">
        <div><span className="muted">{t('parent.child.eligibility')}: </span><EligibleText eligible={c.eligible} /></div>
        {c.enrolment && (
          <div>
            <span className="muted">{t('parent.child.current')}: </span>
            {L(c.enrolment, 'school')} · {gradeLabel(t, c.enrolment.grade)}{c.enrolment.section ? `-${c.enrolment.section}` : ''} <StatusBadge status={c.enrolment.status} />
            {c.enrolment.leave_requested_at && c.enrolment.status === 'enrolled' && <span className="badge amber">{t('parent.child.leave_pending', { date: fmtDate(c.enrolment.leave_date) })}</span>}
          </div>
        )}
        {c.next_year && (
          <div><span className="muted">{t('parent.child.next_year')}: </span>{L(c.next_year, 'school')} · {gradeLabel(t, c.next_year.grade)} <StatusBadge status={c.next_year.status} /></div>
        )}
        {siblings.length > 0 && (
          <div><span className="muted">{t('parent.child.siblings')}: </span>{siblings.map((s) => L(s, 'full_name')).join(lang === 'ar' ? '، ' : ', ')}</div>
        )}
        {active && (
          <div className="card" style={{ padding: 10, background: 'var(--gold-50)' }}>
            <div className="row between">
              <span><b>{active.ref || t('parent.child.draft')}</b> · {t(`pathway.${active.pathway}`)} · {gradeLabel(t, active.grade)}</span>
              <StatusBadge status={active.status} />
            </div>
            {active.school_en && <div className="muted">{L(active, 'school')}</div>}
            <div className="mt" style={{ marginTop: 6 }}><ActionBanner app={active} /></div>
            <div className="row" style={{ marginTop: 6 }}>
              {active.status === 'draft'
                ? <button className="btn sm" onClick={() => nav(`/parent/apply/${active.id}`)}>{t('parent.child.continue')}</button>
                : <button className="btn sm" onClick={() => nav(`/parent/applications/${active.id}`)}>{t('parent.child.track')}</button>}
            </div>
          </div>
        )}
      </div>
      <div className="row mt">
        {c.can_apply && <button className="btn sm" onClick={onApply}>{t('parent.child.apply')}</button>}
        {c.can_renew && <Link className="btn sm success" to={`/parent/children/${c.id}/renew`}>{t('parent.child.renew')}</Link>}
        {c.can_leave && <Link className="btn sm secondary" to={`/parent/children/${c.id}/leave`}>{t('parent.child.leave')}</Link>}
      </div>
      {c.applications.filter((a) => a.id !== active?.id).length > 0 && (
        <details className="small mt">
          <summary>{t('parent.child.history', { n: c.applications.filter((a) => a.id !== active?.id).length })}</summary>
          <div className="stack mt">
            {c.applications.filter((a) => a.id !== active?.id).map((a) => (
              <div key={a.id} className="row between">
                <Link to={a.status === 'draft' ? `/parent/apply/${a.id}` : `/parent/applications/${a.id}`}>{a.ref || t('parent.child.draft')}</Link>
                <span className="muted">{a.ay} · {t(`type.${a.type}`)} · {gradeLabel(t, a.grade)}</span>
                <StatusBadge status={a.status} />
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
