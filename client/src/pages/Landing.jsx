// Entry page: choose how to sign in. Parents (and second guardians) go to UAE PASS (PP-01 / A16);
// each staff role from Section 3 goes to its own sign-in page.
import { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useI18n } from '../i18n.jsx';
import { HOME_FOR } from '../components/Layout.jsx';

export const STAFF_ROLES = ['registrar', 'principal', 'cluster_officer', 'ministry_admin', 'ministry_viewer', 'transport'];
const ICON = { registrar: '📋', principal: '🏫', cluster_officer: '🗺️', ministry_admin: '⚙️', ministry_viewer: '📊', transport: '🚌' };

export default function Landing() {
  const { t } = useI18n();
  const { me } = useAuth();
  const nav = useNavigate();

  useEffect(() => { if (me) nav(HOME_FOR[me.role], { replace: true }); }, [me]);

  return (
    <div className="landing">
      <header className="landing-hero">
        <h1>{t('landing.title')}</h1>
        <p>{t('landing.sub')}</p>
      </header>

      <h2 className="landing-h">{t('landing.choose_role')}</h2>

      <button className="role-card parent" onClick={() => nav('/uaepass')}>
        <span className="role-icon">👪</span>
        <span className="role-text">
          <b>{t('role.parent')}</b>
          <span>{t('landing.desc.parent')}</span>
        </span>
        <span className="uaepass-chip">UAE PASS →</span>
      </button>

      <div className="landing-sub">{t('landing.staff_group')}</div>
      <div className="role-grid">
        {STAFF_ROLES.map((r) => (
          <button key={r} className="role-card" onClick={() => nav(`/login/${r}`)}>
            <span className="role-icon">{ICON[r]}</span>
            <span className="role-text">
              <b>{t(`role.${r}`)}</b>
              <span>{t(`landing.desc.${r}`)}</span>
            </span>
            <span className="role-arrow">→</span>
          </button>
        ))}
      </div>

      <p className="landing-foot">
        <span className="badge gold">{t('landing.pilot')}</span>
        <span className="badge">{t('landing.synthetic')}</span>
        <Link to="/docs">{t('landing.read_docs')} →</Link>
      </p>
    </div>
  );
}
