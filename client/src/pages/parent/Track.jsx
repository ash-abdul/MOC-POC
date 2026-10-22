// Application tracking (PP-18): status, timeline, action required with deadline, offer
// acceptance / decline, offer letter, information-request response, withdrawal.
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, fileUrl } from '../../api.js';
import { useI18n } from '../../i18n.jsx';
import { useAuth } from '../../auth.jsx';
import { useAsync, Loader, PageHead, Card, Kv, Modal, StatusBadge, Field, useAction, ReqTag } from '../../components/ui.jsx';
import { ActionBanner, gradeLabel } from './shared.jsx';
import { UploadModal } from './Apply.jsx';

const ENDED = ['accepted', 'rejected', 'withdrawn', 'lapsed', 'closed'];

export default function Track() {
  const { id } = useParams();
  const { t, L, fmtDate, fmtDateTime } = useI18n();
  const { label, refresh } = useAuth();
  const st = useAsync(() => api.get(`/family/applications/${id}`), [id]);
  const [modal, setModal] = useState(null);
  const [upFor, setUpFor] = useState(null);
  const [msg, setMsg] = useState('');
  const [run, busy] = useAction();

  const act = (path, body, ok) => run(async () => { await api.post(`/family/applications/${id}/${path}`, body); setModal(null); await st.reload(); refresh(); }, ok);

  return (
    <Loader state={st}>
      {(d) => {
        const a = d.app;
        const ir = a.info_request;
        const canWithdraw = !ENDED.includes(a.status);
        return (
          <>
            <PageHead title={`${L(a.child, 'full_name')} · ${a.ref || t('parent.child.draft')}`} sub={`${t(`pathway.${a.pathway}`)} · ${gradeLabel(t, a.grade)} · ${a.ay}`} reqs={['PP-18']}>
              <StatusBadge status={a.status} />
            </PageHead>

            <div className="mb"><ActionBanner app={a} /></div>

            {a.status === 'offer_made' && (
              <Card title={t('parent.track.offer_title')} style={{ borderTop: '4px solid var(--gold-500)', marginBottom: 16 }}>
                <p>{t('parent.track.offer_text', { school: L(a.school), grade: gradeLabel(t, a.grade), section: a.section?.name, date: fmtDate(a.offer_due_at) })}</p>
                <p className="small muted">{t('parent.track.offer_rule')} <ReqTag id="BR-08" /></p>
                <div className="row">
                  <button className="btn success" disabled={busy} onClick={() => act('accept', {}, t('parent.track.accepted_ok'))}>{t('parent.track.accept')}</button>
                  <button className="btn secondary" disabled={busy} onClick={() => setModal('decline')}>{t('parent.track.decline')}</button>
                  <Link className="btn ghost" to={`/parent/applications/${a.id}/offer-letter`}>{t('parent.track.offer_letter')}</Link>
                </div>
              </Card>
            )}

            {a.status === 'accepted' && (
              <div className="alert success mb">
                <div style={{ flex: 1 }}>{t('parent.track.accepted_text', { school: L(a.school), grade: gradeLabel(t, a.grade), section: a.section?.name || '' })}</div>
                {a.section && <Link className="btn sm" to={`/parent/applications/${a.id}/offer-letter`}>{t('parent.track.offer_letter')}</Link>}
              </div>
            )}

            {a.status === 'info_requested' && ir && (
              <Card title={t('parent.track.info_title')} style={{ borderTop: '4px solid var(--amber-500)', marginBottom: 16 }}>
                <Kv items={[
                  [t('common.reason'), label('info_reason', ir.reason)],
                  ir.note ? [t('common.note'), ir.note] : null,
                  [t('parent.track.respond_by'), fmtDate(a.info_due_at)],
                ]} />
                <p className="small muted mt">{t('parent.track.info_rule')} <ReqTag id="BR-07" /></p>
                {(ir.docTypes || []).length > 0 && (
                  <div className="row mt">
                    {ir.docTypes.map((dt) => {
                      const item = d.checklist.find((c) => c.doc_type === dt) || { doc_type: dt, label: null };
                      const lab = item.label ? L(item.label, 'label') : label('doc_type', dt);
                      const fresh = d.documents.find((x) => x.doc_type === dt && x.uploaded_at > a.paused_at);
                      return (
                        <button key={dt} className={`btn sm ${fresh ? 'secondary' : ''}`} onClick={() => setUpFor({ ...item, label: item.label || { label_en: lab, label_ar: lab } })}>
                          {fresh ? '✓ ' : '⬆ '}{lab}
                        </button>
                      );
                    })}
                  </div>
                )}
                <Field label={t('parent.track.message')}><textarea rows={2} value={msg} onChange={(e) => setMsg(e.target.value)} /></Field>
                <button className="btn mt" disabled={busy} onClick={() => act('respond', { message: msg }, t('parent.track.responded'))}>{t('parent.track.respond')}</button>
              </Card>
            )}

            <div className="grid c2">
              <div>
                <Card title={t('parent.track.summary')}>
                  <Kv items={[
                    [t('parent.apply.reference'), <span className="mono">{a.ref}</span>],
                    [t('common.status'), <StatusBadge status={a.status} />],
                    [t('parent.track.submitted_on'), fmtDateTime(a.submitted_at)],
                    [t('parent.track.current_school'), a.school ? L(a.school) : '—'],
                    a.escalation_reason && a.status === 'escalated' ? [t('parent.track.with_cluster'), t(`escalation.${a.escalation_reason}`)] : null,
                    a.end_reason ? [t('parent.track.end_reason'), label('reject_reason', a.end_reason) !== a.end_reason ? label('reject_reason', a.end_reason) : t(`parent.end.${a.end_reason}`, { default: a.end_reason })] : null,
                    [t('parent.apply.step.transport'), a.transport_mode ? t(`transport.${a.transport_mode}`) : '—'],
                    a.bus ? [t('parent.track.bus_seat'), <span>{a.bus.route_code} – {L(a.bus, 'route')} {a.bus.status && <StatusBadge status={a.bus.status} />}</span>] : null,
                  ]} />
                  <h4 className="mt">{t('parent.track.preferences')}</h4>
                  <ol className="small" style={{ margin: 0, paddingInlineStart: 20 }}>
                    {a.preferences.map((p) => <li key={p.id} style={{ fontWeight: p.current ? 600 : 400 }}>{L(p)} {p.current && !ENDED.includes(a.status) && <span className="badge blue">{t('parent.track.now_with')}</span>}</li>)}
                  </ol>
                </Card>
                <Card title={t('parent.track.documents')}>
                  {d.checklist.length === 0 ? <p className="small muted">{t('common.no_data')}</p> : d.checklist.map((c) => (
                    <div key={c.doc_type} className="row between small" style={{ padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                      <span>{L(c.label, 'label')}</span>
                      {c.document ? (
                        <span className="row" style={{ gap: 6 }}>
                          <StatusBadge status={c.document.status} />
                          {c.document.status === 'rejected' && <span className="muted">{label('reject_reason', c.document.reject_reason)}</span>}
                          <a href={fileUrl(c.document.id)} target="_blank" rel="noreferrer">{t('common.view')}</a>
                        </span>
                      ) : c.last_rejected ? (
                        <span className="row" style={{ gap: 6 }}><span className="badge red">{t('status.rejected')}</span><span className="muted">{label('reject_reason', c.last_rejected.reject_reason)}</span></span>
                      ) : <span className="muted">{c.needed ? t('parent.docs.missing') : '—'}</span>}
                    </div>
                  ))}
                </Card>
              </div>
              <Card title={t('parent.track.timeline')}>
                <ul className="timeline">
                  {d.timeline.map((e) => (
                    <li key={e.id}>
                      <div><b>{t(`parent.event.${e.action}`, { default: e.action })}</b>{e.status && <> · <span className="small">{t(`status.${e.status}`)}</span></>}</div>
                      <div className="when">
                        {fmtDateTime(e.at)}
                        {e.actor_role && e.actor_role !== 'parent' ? ` · ${t(`role.${e.actor_role}`)}` : ''}
                        {e.school_en ? ` · ${L(e, 'school')}` : ''}
                      </div>
                      {e.note && !e.note.startsWith('escalation:') && <div className="small muted">{e.note}</div>}
                    </li>
                  ))}
                </ul>
              </Card>
            </div>

            {canWithdraw && (
              <div className="card mt">
                <div className="row between">
                  <span className="small muted">{d.isPrimary ? t('parent.track.withdraw_note') : t('parent.track.withdraw_second')}</span>
                  <button className="btn danger sm" disabled={!d.isPrimary || busy} onClick={() => setModal('withdraw')}>{t('parent.track.withdraw')}</button>
                </div>
              </div>
            )}

            {modal && (
              <Modal title={t(`parent.track.${modal}_confirm_title`)} onClose={() => setModal(null)} footer={
                <>
                  <button className="btn secondary" onClick={() => setModal(null)}>{t('common.cancel')}</button>
                  <button className="btn danger" disabled={busy} onClick={() => act(modal === 'decline' ? 'decline' : 'withdraw', { reason: modal === 'decline' ? 'offer_declined' : 'parent_withdrew' }, t('common.saved'))}>{t('common.confirm')}</button>
                </>
              }>
                <p>{t(`parent.track.${modal}_confirm_text`)}</p>
              </Modal>
            )}
            {upFor && <UploadModal item={upFor} app={a} onClose={() => setUpFor(null)} onDone={async () => { setUpFor(null); await st.reload(); }} />}
          </>
        );
      }}
    </Loader>
  );
}
