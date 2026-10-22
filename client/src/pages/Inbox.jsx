// In-portal messages (section 4.5).
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useI18n } from '../i18n.jsx';
import { useAsync, PageHead, Loader, Empty } from '../components/ui.jsx';

export default function Inbox() {
  const { t, L, fmtDateTime } = useI18n();
  const { me, refresh } = useAuth();
  const st = useAsync(() => api.get('/notifications'), []);
  useEffect(() => {
    if (st.data && me?.unread) api.post('/notifications/read').then(refresh);
  }, [st.data]);
  const appLink = (n) => (me.role === 'parent' ? `/parent/applications/${n.application_id}` : `/school/applications/${n.application_id}`);
  return (
    <>
      <PageHead title={t('nav.inbox')} sub={t('inbox.sub')} reqs={['4.5']} />
      <Loader state={st}>
        {(rows) => rows.length === 0 ? <Empty /> : (
          <div className="stack">
            {rows.map((n) => (
              <div key={n.id} className="card" style={{ padding: 14, borderInlineStart: n.read ? undefined : '4px solid var(--gold-500)' }}>
                <div className="row between">
                  <b>{L(n, 'subject')}</b>
                  <span className="small muted">{fmtDateTime(n.created_at)}</span>
                </div>
                <div className="small" style={{ marginTop: 4 }}>{L(n, 'body')}</div>
                {n.application_id && <Link className="small" to={appLink(n)}>{t('inbox.open_application')} →</Link>}
              </div>
            ))}
          </div>
        )}
      </Loader>
    </>
  );
}
