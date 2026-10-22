// Second guardian confirmation (PP-02, A16): the invited guardian has signed in with UAE PASS;
// the server checks that their Emirates ID matches the invitation before linking.
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { useI18n } from '../../i18n.jsx';
import { useAuth } from '../../auth.jsx';
import { PageHead, Card, Kv, useAction, Empty } from '../../components/ui.jsx';

export default function GuardianLink() {
  const { t, L } = useI18n();
  const { me, refresh } = useAuth();
  const nav = useNavigate();
  const [run, busy] = useAction();
  const confirm = (inv) => run(async () => {
    await api.post('/auth/guardian-link/confirm', { guardianId: inv.id });
    await refresh();
    nav('/parent');
  }, t('parent.link.done'));
  return (
    <>
      <PageHead title={t('parent.link.title')} sub={t('parent.link.sub')} reqs={['PP-02', 'A16']} />
      {!me.invites?.length ? <Empty>{t('parent.link.none')}</Empty> : me.invites.map((inv) => (
        <Card key={inv.id} title={t('parent.link.invited_by', { name: L(inv, 'inviter') })}>
          <Kv items={[
            [t('parent.link.your_eid'), <span className="mono">{me.emirates_id}</span>],
            [t('parent.link.verified'), <span className="badge green">✓ UAE PASS</span>],
            [t('parent.profile.relationship'), t(`relationship.${inv.relationship || 'guardian'}`)],
          ]} />
          <div className="alert info small mt">{t('parent.link.rights')}</div>
          <button className="btn mt" disabled={busy} onClick={() => confirm(inv)}>{t('parent.link.confirm')}</button>
        </Card>
      ))}
    </>
  );
}
