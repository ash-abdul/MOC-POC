// Application shell: top bar, header with language switch, role-based side navigation.
import { useState } from 'react';
import { NavLink, Link, useNavigate, useLocation } from 'react-router-dom';
import { useI18n } from '../i18n.jsx';
import { useAuth } from '../auth.jsx';

// [path, i18n key, roles]
export const NAV = [
  ['group', 'nav.group.family', ['parent']],
  ['/parent', 'nav.family', ['parent']],
  ['/parent/profile', 'nav.profile', ['parent']],
  ['/parent/documents', 'nav.documents', ['parent']],
  ['group', 'nav.group.school', ['registrar', 'principal', 'cluster_officer', 'ministry_admin']],
  ['/cluster', 'nav.cluster', ['cluster_officer', 'ministry_admin']],
  ['/school/queue', 'nav.queue', ['registrar', 'principal', 'cluster_officer', 'ministry_admin']],
  ['/school/students', 'nav.students', ['registrar', 'principal', 'cluster_officer', 'ministry_admin']],
  ['/school/capacity', 'nav.school_capacity', ['registrar', 'principal']],
  ['/school/leavers', 'nav.leavers', ['registrar', 'principal', 'cluster_officer']],
  ['/transport', 'nav.transport', ['transport']],
  ['group', 'nav.group.insights', ['principal', 'cluster_officer', 'ministry_admin', 'ministry_viewer', 'transport']],
  ['/insights', 'nav.dashboard', ['principal', 'cluster_officer', 'ministry_admin', 'ministry_viewer', 'transport']],
  ['/insights/reports', 'nav.reports', ['principal', 'cluster_officer', 'ministry_admin', 'ministry_viewer', 'transport']],
  ['group', 'nav.group.admin', ['ministry_admin', 'ministry_viewer']],
  ['/admin/capacity', 'nav.capacity', ['ministry_admin', 'ministry_viewer']],
  ['/admin/catchments', 'nav.catchments', ['ministry_admin', 'ministry_viewer']],
  ['/admin/rules', 'nav.rules', ['ministry_admin', 'ministry_viewer']],
  ['/admin/windows', 'nav.windows', ['ministry_admin', 'ministry_viewer']],
  ['/admin/lists', 'nav.lists', ['ministry_admin', 'ministry_viewer']],
  ['/admin/holidays', 'nav.holidays', ['ministry_admin', 'ministry_viewer']],
  ['/admin/templates', 'nav.templates', ['ministry_admin', 'ministry_viewer']],
  ['/admin/users', 'nav.users', ['ministry_admin', 'ministry_viewer']],
  ['/admin/translations', 'nav.translations', ['ministry_admin', 'ministry_viewer']],
  ['/admin/audit', 'nav.audit', ['ministry_admin', 'ministry_viewer']],
  ['/admin/demo', 'nav.demo', ['ministry_admin']],
  ['group', 'nav.group.general', ['*']],
  ['/inbox', 'nav.inbox', ['*']],
  ['/mock/outbox', 'nav.outbox', ['*']],
  ['/docs', 'nav.docs', ['*']],
];

export const HOME_FOR = { parent: '/parent', registrar: '/school/queue', principal: '/school/queue', cluster_officer: '/cluster', ministry_admin: '/insights', ministry_viewer: '/insights', transport: '/transport' };

export function LangSwitch() {
  const { lang, setLang } = useI18n();
  const { me } = useAuth();
  const flip = () => {
    const l = lang === 'ar' ? 'en' : 'ar';
    setLang(l);
    if (me) fetch('/api/auth/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('moe_token')}` }, body: JSON.stringify({ lang: l }) });
  };
  return <button className="btn secondary sm" onClick={flip} aria-label="Switch language">{lang === 'ar' ? 'English' : 'العربية'}</button>;
}

export default function Layout({ children, bare }) {
  const { t, L } = useI18n();
  const { me, signOut, lookups } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  const items = me ? NAV.filter(([, , roles]) => roles.includes('*') || roles.includes(me.role)) : [];

  return (
    <>
      <div className="topbar">
        <div className="inner">
          <span className="gov">{t('app.gov')}</span>
          <span className="demo">
            {t('app.poc_banner')}
            {lookups?.clock_offset_days ? ` · ${t('app.demo_clock', { days: lookups.clock_offset_days, date: lookups.today })}` : ''}
          </span>
        </div>
      </div>
      <header className="header">
        <div className="inner">
          {me && <button className="btn secondary sm menu-btn" onClick={() => setOpen(!open)} aria-label="Menu">☰</button>}
          <Link to={me ? HOME_FOR[me.role] : '/'} className="brand">
            <div className="mark">MoE</div>
            <div className="names"><b>{t('app.title')}</b><span>{t('app.ministry')}</span></div>
          </Link>
          <div className="spacer" />
          <div className="actions">
            {me && (
              <Link to="/inbox" className="btn ghost sm" title={t('nav.inbox')}>
                🔔{me.unread ? <span className="badge red">{me.unread}</span> : null}
              </Link>
            )}
            <LangSwitch />
            {me ? (
              <>
                <div className="userchip">
                  <b>{L(me)}</b>
                  <small>{t(`role.${me.role}`)}{me.school ? ` · ${L(me.school)}` : ''}{me.force_registration ? ` · ${t('role.force')}` : ''}</small>
                </div>
                <button className="btn secondary sm signout-top" onClick={async () => { await signOut(); nav('/'); }}>{t('common.sign_out')}</button>
              </>
            ) : (
              loc.pathname !== '/' && <Link to="/" className="btn sm">{t('common.sign_in')}</Link>
            )}
          </div>
        </div>
      </header>
      <div className={`shell ${!me || bare ? 'no-nav' : ''}`}>
        {me && !bare && (
          <nav className={`sidenav ${open ? 'open' : ''}`} onClick={() => setOpen(false)}>
            {items.map(([path, key], i) =>
              path === 'group'
                ? <div key={i} className="group">{t(key)}</div>
                : <NavLink key={path} to={path} end={path === '/parent' || path === '/insights'}>{t(key)}{path === '/inbox' && me.unread ? <span className="count">{me.unread}</span> : null}</NavLink>
            )}
            {/* phones: who is signed in and Sign out live at the end of the menu */}
            <div className="nav-account" onClick={(e) => e.stopPropagation()}>
              <div className="small"><b>{L(me)}</b><br /><span className="muted">{t(`role.${me.role}`)}{me.school ? ` · ${L(me.school)}` : ''}</span></div>
              <button className="btn secondary sm" onClick={async () => { setOpen(false); await signOut(); nav('/'); }}>{t('common.sign_out')}</button>
            </div>
          </nav>
        )}
        <main className="content">{children}</main>
      </div>
    </>
  );
}
