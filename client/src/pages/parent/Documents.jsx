// Family document store (PP-13): documents are reused across applications unless expired.
import { api, fileUrl } from '../../api.js';
import { useI18n } from '../../i18n.jsx';
import { useAuth } from '../../auth.jsx';
import { useAsync, Loader, PageHead, DataTable, StatusBadge } from '../../components/ui.jsx';

export default function Documents() {
  const { t, L, fmtDate } = useI18n();
  const { label, lookups } = useAuth();
  const st = useAsync(() => api.get('/family'), []);
  return (
    <>
      <PageHead title={t('nav.documents')} sub={t('parent.docs.sub')} reqs={['PP-13', 'PP-14']} />
      <Loader state={st}>
        {(d) => (
          <DataTable
            rows={d.documents}
            empty={t('parent.docs.none')}
            columns={[
              { key: 'doc_type', label: t('parent.docs.document'), render: (r) => <><b>{label('doc_type', r.doc_type)}</b><div className="small muted">{r.filename}</div></> },
              { key: 'child', label: t('parent.docs.belongs_to'), render: (r) => (r.child_id ? L(r, 'child') : t('parent.docs.family')) },
              { key: 'ref_number', label: t('parent.docs.ref'), render: (r) => r.ref_number || '—' },
              { key: 'expiry_date', label: t('parent.docs.expiry_date'), render: (r) => (r.expiry_date ? <span className={r.expiry_date < lookups.today ? 'badge red' : ''}>{fmtDate(r.expiry_date)}</span> : r.issue_date ? `${t('parent.docs.issued')} ${fmtDate(r.issue_date)}` : '—') },
              { key: 'status', label: t('common.status'), render: (r) => <><StatusBadge status={r.status} />{r.reject_reason && <div className="small muted">{label('reject_reason', r.reject_reason)}</div>}</> },
              { key: 'uploaded_at', label: t('parent.docs.uploaded_on'), render: (r) => fmtDate(r.uploaded_at) },
              { key: 'view', label: '', render: (r) => <a href={fileUrl(r.id)} target="_blank" rel="noreferrer">{t('common.preview')}</a> },
            ]}
          />
        )}
      </Loader>
    </>
  );
}
