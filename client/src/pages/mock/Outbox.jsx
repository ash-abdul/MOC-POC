// Mock mailbox and SMS log (section 8: email / SMS simulated). Shows exactly what would be sent.
import { useState } from 'react';
import { api, qs } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { useI18n } from '../../i18n.jsx';
import { useAsync, PageHead, Loader, Tabs, DataTable } from '../../components/ui.jsx';

export default function Outbox() {
  const { t, fmtDateTime, lang } = useI18n();
  const { me } = useAuth();
  const [channel, setChannel] = useState('email');
  const [scope, setScope] = useState(me.role === 'parent' ? 'mine' : 'mine');
  const [open, setOpen] = useState(null);
  const st = useAsync(() => api.get(`/mock/outbox${qs({ channel, scope })}`), [channel, scope]);
  return (
    <>
      <PageHead title={t('nav.outbox')} sub={t('outbox.sub')} reqs={['4.5', 'AD-05']}>
        {me.role !== 'parent' && (
          <select value={scope} onChange={(e) => setScope(e.target.value)} style={{ width: 'auto' }}>
            <option value="mine">{t('outbox.mine')}</option>
            <option value="all">{t('outbox.all')}</option>
          </select>
        )}
      </PageHead>
      <Tabs tabs={[['email', t('outbox.email')], ['sms', t('outbox.sms')]]} value={channel} onChange={setChannel} />
      <Loader state={st}>
        {(rows) => (
          <DataTable
            rows={rows}
            onRowClick={(r) => setOpen(open === r.id ? null : r.id)}
            columns={[
              { key: 'created_at', label: t('col.at'), render: (r) => <span className="nowrap small">{fmtDateTime(r.created_at)}</span> },
              { key: 'to_address', label: t('outbox.to'), render: (r) => <span className="small">{r.to_address}<br /><span className="muted">{lang === 'ar' ? r.user_ar : r.user_en}</span></span> },
              {
                key: 'subject', label: channel === 'email' ? t('outbox.subject') : t('outbox.message'),
                render: (r) => (
                  <div>
                    {channel === 'email' && <b>{r.subject_en}</b>}
                    {(open === r.id || channel === 'sms') && (
                      <div className="grid c2 small" style={{ marginTop: 6 }}>
                        <div dir="ltr" style={{ background: 'var(--black-50)', padding: 8, borderRadius: 6 }}>{channel === 'email' && <b>{r.subject_en}<br /></b>}{r.body_en}</div>
                        <div dir="rtl" style={{ background: 'var(--gold-50)', padding: 8, borderRadius: 6, fontFamily: 'Noto Kufi Arabic' }}>{channel === 'email' && <b>{r.subject_ar}<br /></b>}{r.body_ar}</div>
                      </div>
                    )}
                  </div>
                ),
              },
              { key: 'template', label: t('outbox.template'), render: (r) => <code>{r.template}</code> },
            ]}
          />
        )}
      </Loader>
    </>
  );
}
