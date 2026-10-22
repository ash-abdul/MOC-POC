// Entry page: parents sign in with UAE PASS only (PP-01 / A16); staff pick a demo persona.
import { useNavigate, Link } from 'react-router-dom';
import { useEffect } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useI18n } from '../i18n.jsx';
import { useAsync, Card, useAction, ReqTag } from '../components/ui.jsx';
import { HOME_FOR } from '../components/Layout.jsx';

const ROLE_ORDER = ['registrar', 'principal', 'cluster_officer', 'ministry_admin', 'ministry_viewer', 'transport'];
const FEATURED = ['SHJ-S01', 'SHJ-S03', 'SHJ-S07', 'SHJ-S12'];

export default function Landing() {
  const { t, L } = useI18n();
  const { me, signIn } = useAuth();
  const nav = useNavigate();
  const personas = useAsync(() => api.get('/auth/staff-personas'), []);
  const [run, busy] = useAction();

  useEffect(() => { if (me) nav(HOME_FOR[me.role], { replace: true }); }, [me]);

  const staffSignIn = (p) => run(async () => {
    const { token } = await api.post('/auth/staff', { userId: p.id });
    const m = await signIn(token);
    nav(HOME_FOR[m.role]);
  });

  const byRole = (role) => (personas.data || []).filter((p) => p.role === role && (!['registrar', 'principal'].includes(role) || FEATURED.includes(p.school_code)));
  const allSchoolStaff = (personas.data || []).filter((p) => ['registrar', 'principal'].includes(p.role) && !FEATURED.includes(p.school_code));

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <section className="card" style={{ background: 'linear-gradient(120deg, var(--gold-50), #fff 60%)', borderTop: '4px solid var(--gold-500)', padding: 28 }}>
        <h1 style={{ fontSize: '1.9rem' }}>{t('landing.title')}</h1>
        <p className="muted" style={{ maxWidth: 720 }}>{t('landing.sub')}</p>
        <div className="row small muted">
          <span className="badge gold">{t('landing.pilot')}</span>
          <span className="badge">{t('landing.synthetic')}</span>
          <Link to="/docs">{t('landing.read_docs')} →</Link>
        </div>
      </section>

      <div className="grid c2 mt">
        <Card title={t('landing.parents')}>
          <p>{t('landing.parents_text')}</p>
          <button className="btn uaepass lg" onClick={() => nav('/uaepass')}>
            <span style={{ fontWeight: 700 }}>UAE PASS</span>&nbsp;·&nbsp;{t('landing.uaepass_btn')}
          </button>
          <div className="alert info small mt">{t('landing.uaepass_only')} <ReqTag id="PP-01" /> <ReqTag id="A16" /></div>
        </Card>

        <Card title={t('landing.staff')}>
          <p className="small muted">{t('landing.staff_text')}</p>
          {ROLE_ORDER.map((role) => (
            <div key={role} style={{ marginBottom: 10 }}>
              <div className="small" style={{ fontWeight: 600, marginBottom: 4 }}>{t(`role.${role}`)}</div>
              <div className="row">
                {byRole(role).map((p) => (
                  <button key={p.id} className="btn secondary sm" disabled={busy} onClick={() => staffSignIn(p)} title={p.email}>
                    {L(p)}{p.school_code ? ` · ${L(p, 'school')}` : ''}{p.force_registration ? ` · ${t('role.force')}` : ''}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {allSchoolStaff.length > 0 && (
            <details className="small">
              <summary>{t('landing.more_staff')}</summary>
              <div className="row mt">{allSchoolStaff.map((p) => <button key={p.id} className="btn ghost sm" onClick={() => staffSignIn(p)}>{t(`role.${p.role}`)} · {L(p, 'school')}</button>)}</div>
            </details>
          )}
        </Card>
      </div>
    </div>
  );
}
