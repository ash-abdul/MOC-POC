// Simulated UAE PASS authorisation screen (section 8 mock). In production this is the UAE PASS
// OIDC redirect; here the tester picks a synthetic identity and grants consent.
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useI18n } from '../i18n.jsx';
import { useAsync, useAction } from '../components/ui.jsx';
import { LangSwitch } from '../components/Layout.jsx';

export default function UaePass() {
  const { t, L, lang } = useI18n();
  const { signIn } = useAuth();
  const nav = useNavigate();
  const accounts = useAsync(() => api.get('/auth/uaepass/accounts'), []);
  const [eid, setEid] = useState('');
  const [chosen, setChosen] = useState(null);
  const [run, busy] = useAction();

  const consent = () => run(async () => {
    const res = await api.post('/auth/uaepass', { emiratesId: chosen.emirates_id, lang });
    await signIn(res.token);
    if (res.invites?.length) nav('/parent/link');
    else nav(res.familyCreated ? '/parent?welcome=1' : '/parent');
  });

  const shell = (children) => (
    <div style={{ minHeight: '100vh', background: '#f3f4f6', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div style={{ width: 'min(460px, 100%)', background: '#fff', borderRadius: 12, boxShadow: '0 10px 30px rgb(0 0 0 / .1)', overflow: 'hidden' }}>
        <div style={{ background: '#000', color: '#fff', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <b style={{ fontSize: '1.2rem', letterSpacing: '.02em' }}>UAE PASS</b>
          <LangSwitch />
        </div>
        <div style={{ background: '#fff3cd', color: '#7a5b00', fontSize: '.78rem', padding: '6px 18px' }}>{t('uaepass.simulated')}</div>
        <div style={{ padding: 20 }}>{children}</div>
      </div>
    </div>
  );

  if (chosen) {
    return shell(
      <>
        <h2>{t('uaepass.consent_title')}</h2>
        <p className="small">{t('uaepass.consent_text')}</p>
        <ul className="small">
          <li>{t('uaepass.claim_name')}: <b>{L(chosen)}</b></li>
          <li>{t('uaepass.claim_eid')}: <b className="mono">{chosen.emirates_id}</b></li>
          <li>{t('uaepass.claim_mobile')}: <b>{chosen.mobile}</b></li>
          <li>{t('uaepass.claim_email')}: <b>{chosen.email}</b></li>
        </ul>
        <div className="row">
          <button className="btn uaepass" disabled={busy} onClick={consent}>{t('uaepass.allow')}</button>
          <button className="btn secondary" onClick={() => setChosen(null)}>{t('common.cancel')}</button>
        </div>
      </>
    );
  }

  const list = accounts.data || [];
  const typed = list.find((a) => a.emirates_id === eid.trim());
  return shell(
    <>
      <h2>{t('uaepass.login_title')}</h2>
      <label className="field">
        <span>{t('uaepass.eid')}</span>
        <input value={eid} onChange={(e) => setEid(e.target.value)} placeholder="784-XXXX-XXXXXXX-X" className="mono" />
      </label>
      <button className="btn uaepass mt" style={{ width: '100%' }} disabled={!typed} onClick={() => setChosen(typed)}>{t('uaepass.login')}</button>
      {eid && !typed && <div className="hint">{t('uaepass.no_account')}</div>}
      <hr />
      <div className="small muted" style={{ marginBottom: 6 }}>{t('uaepass.test_accounts')}</div>
      <div style={{ maxHeight: 340, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
        {list.map((a) => (
          <button key={a.emirates_id} onClick={() => setChosen(a)} style={{ display: 'block', width: '100%', textAlign: 'start', background: a.note ? 'var(--gold-50)' : '#fff', border: 0, borderBottom: '1px solid var(--border)', padding: '8px 10px', cursor: 'pointer', font: 'inherit' }}>
            <b>{L(a)}</b> <span className="mono small muted">{a.emirates_id}</span>
            {a.note && <div className="small" style={{ color: 'var(--gold-800)' }}>{a.note}</div>}
          </button>
        ))}
      </div>
      <p className="small mt"><Link to="/">← {t('common.back')}</Link></p>
    </>
  );
}
