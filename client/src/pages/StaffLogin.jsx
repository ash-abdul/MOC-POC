// Staff sign-in for one role. In production this is the Ministry single sign-on; in the PoC the
// tester picks one of the synthetic accounts that hold the role.
import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link, Navigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useI18n } from '../i18n.jsx';
import { useAsync, useAction, Loader } from '../components/ui.jsx';
import { HOME_FOR } from '../components/Layout.jsx';
import { STAFF_ROLES } from './Landing.jsx';

export default function StaffLogin() {
  const { role } = useParams();
  const { t, L } = useI18n();
  const { me, signIn } = useAuth();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const personas = useAsync(() => api.get('/auth/staff-personas'), []);
  const [run, busy] = useAction();

  useEffect(() => { if (me) nav(HOME_FOR[me.role], { replace: true }); }, [me]);
  if (!STAFF_ROLES.includes(role)) return <Navigate to="/" replace />;

  const signInAs = (p) => run(async () => {
    const { token } = await api.post('/auth/staff', { userId: p.id });
    const m = await signIn(token);
    nav(HOME_FOR[m.role]);
  });

  return (
    <div className="landing" style={{ maxWidth: 640 }}>
      <Link to="/" className="small">← {t('login.back')}</Link>
      <div className="card mt" style={{ borderTop: '4px solid var(--gold-500)' }}>
        <h1 style={{ fontSize: '1.4rem' }}>{t('login.title', { role: t(`role.${role}`) })}</h1>
        <p className="small muted">{t(`landing.desc.${role}`)}</p>
        <div className="alert info small">{t('login.sso_note')}</div>

        <h3 className="mt">{t('login.choose_account')}</h3>
        <Loader state={personas}>
          {(all) => {
            const list = all.filter((p) => p.role === role).filter((p) => !q || `${p.name_en} ${p.name_ar} ${p.school_en || ''} ${p.school_ar || ''}`.toLowerCase().includes(q.toLowerCase()));
            const many = all.filter((p) => p.role === role).length > 6;
            return (
              <>
                {many && <input className="mb" placeholder={t('login.search')} value={q} onChange={(e) => setQ(e.target.value)} />}
                {list.length === 0 ? <div className="empty">{t('login.no_accounts')}</div> : (
                  <div className="account-list">
                    {list.map((p) => (
                      <button key={p.id} className="account" disabled={busy} onClick={() => signInAs(p)}>
                        <span>
                          <b>{L(p)}</b>
                          <span className="small muted">{p.school_en ? L(p, 'school') : p.email}</span>
                        </span>
                        {p.force_registration ? <span className="badge gold">{t('role.force')}</span> : null}
                        <span className="role-arrow">→</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            );
          }}
        </Loader>
      </div>
    </div>
  );
}
