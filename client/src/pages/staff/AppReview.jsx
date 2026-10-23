// SB-02..SB-05, SB-07, CC-06: application view, document checks and decisions.
import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, fileUrl } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { useI18n } from '../../i18n.jsx';
import {
  useAsync, useAction, PageHead, Loader, Card, Kv, Modal, Field, StatusBadge, SlaBadge, ReqTag, DataTable, useToast,
} from '../../components/ui.jsx';
import MapView from '../../components/MapView.jsx';
import { AppFlags } from './Queue.jsx';

export function DocPreview({ doc, onClose }) {
  const { t } = useI18n();
  const { label } = useAuth();
  return (
    <Modal title={label('doc_type', doc.doc_type)} onClose={onClose} wide footer={<a className="btn secondary" href={fileUrl(doc.id)} target="_blank" rel="noreferrer">{t('common.open')}</a>}>
      {doc.mime === 'application/pdf'
        ? <iframe title={doc.filename} src={fileUrl(doc.id)} style={{ width: '100%', height: '65vh', border: 0 }} />
        : <img alt={doc.filename} src={fileUrl(doc.id)} style={{ maxWidth: '100%' }} />}
    </Modal>
  );
}

function Timeline({ events }) {
  const { t, L, fmtDateTime } = useI18n();
  return (
    <ul className="timeline">
      {events.map((e) => (
        <li key={e.id}>
          <div className="when">{fmtDateTime(e.at)} · {e.actor_en ? `${L(e, 'actor')} (${t(`role.${e.actor_role}`)})` : t('role.system')}</div>
          <div><b>{t(`bo.ev.${e.action}`, { default: e.action })}</b>{e.school_en ? <span className="small muted"> · {L(e, 'school')}</span> : null}</div>
          {e.note && <div className="small muted">{e.note}</div>}
        </li>
      ))}
    </ul>
  );
}

export default function AppReview() {
  const { id } = useParams();
  const { t, L, fmtDate, fmtDateTime, fmtNum } = useI18n();
  const { me, label, listOf, lookups } = useAuth();
  const toast = useToast();
  const st = useAsync(() => api.get(`/applications/${id}`), [id]);
  const catch_ = useAsync(() => api.get('/lookups/catchments'), []);
  const [run, busy] = useAction();
  const [modal, setModal] = useState(null);
  const [preview, setPreview] = useState(null);
  const [form, setForm] = useState({});
  const [seatLost, setSeatLost] = useState(null);
  const setF = (k) => (e) => setForm((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const act = async (url, body, okKey) => {
    try {
      await run(() => api.post(url, body), t(okKey));
      setModal(null);
      setForm({});
      st.reload();
    } catch (e) {
      if (e.code === 'no_seat') { setSeatLost(e.details?.app || true); setModal(null); st.reload(); }
    }
  };

  return (
    <Loader state={st}>
      {(d) => {
        const a = d.app;
        const fam = d.family || {};
        const home = a.home_lat ? { lat: a.home_lat, lng: a.home_lng } : fam.home_lat ? { lat: fam.home_lat, lng: fam.home_lng } : null;
        const cur = (catch_.data || []).find((c) => c.school_id === a.current_school_id);
        const schoolsOnMap = a.preferences.map((p) => ({ lat: p.lat, lng: p.lng, short: `${p.rank}`, label: L(p), highlight: p.current }));
        const docsBy = (type) => d.documents.filter((x) => x.doc_type === type);
        const residence = ['tenancy', 'utility_bill', 'host_documents'];
        const clusterSchools = (lookups?.schools || []).filter((s) => s.cluster_id === a.school?.cluster_id);
        const factors = { sod: a.child.sod ? t('common.yes') : t('common.no'), sibling: a.sibling_here ? t('common.yes') : t('common.no'), national: a.child.nationality === 'AE' ? t('common.yes') : t('common.no'), distance: `${fmtNum(d.priority.key[d.priority.order.indexOf('distance')], 1)} ${t('common.km')}`, submitted: fmtDateTime(a.submitted_at) };

        return (
          <>
            <PageHead
              title={`${L(a.child, 'full_name')}`}
              sub={<span className="row"><span className="mono">{a.ref || t('status.draft')}</span> · {t(`grade.${a.grade}`)} · {t(`pathway.${a.pathway}`)} · {a.ay}</span>}
              reqs={['SB-02', 'SB-03', 'SB-04', 'SB-09']}
            >
              <StatusBadge status={a.status} /> <SlaBadge sla={a.sla} />
              <Link className="btn secondary sm" to={me.role === 'cluster_officer' ? '/cluster' : '/school/queue'}>← {t('common.back')}</Link>
            </PageHead>

            {seatLost && (
              <div className="alert error mb">
                <div><b>{t('bo.review.seat_lost_title')}</b><br />{t('bo.review.seat_lost_text')} <ReqTag id="CC-05" /> <ReqTag id="A6" /></div>
              </div>
            )}
            {a.status === 'escalated' && <div className="alert warn mb">{t('bo.review.escalated_because')}: <b>{t(`escalation.${a.escalation_reason}`, { default: a.escalation_reason })}</b>{a.exceptional_reason ? ` · ${label('exceptional_reason', a.exceptional_reason)}` : ''}</div>}
            {a.status === 'info_requested' && a.info_request && (
              <div className="alert warn mb">{t('bo.review.waiting_parent', { date: fmtDate(a.info_due_at) })} — {label('info_reason', a.info_request.reason)}{a.info_request.note ? `: ${a.info_request.note}` : ''}</div>
            )}

            <div className="grid c3" style={{ alignItems: 'start' }}>
              <div style={{ gridColumn: 'span 2' }} className="stack">
                <Card title={t('bo.review.child_family')}>
                  <div className="grid c2">
                    <Kv items={[
                      [t('bo.f.eid'), <span className="mono">{a.child.emirates_id}</span>],
                      [t('bo.f.dob'), fmtDate(a.child.dob)],
                      [t('common.gender'), a.child.gender === 'M' ? t('common.male') : t('common.female')],
                      [t('bo.f.nationality'), label('nationality', a.child.nationality)],
                      a.child.passport_no && [t('bo.f.passport'), a.child.passport_no],
                      [t('bo.f.last_grade'), a.child.last_completed_grade ? t(`grade.${a.child.last_completed_grade}`) : '—'],
                      [t('bo.f.sod'), a.child.sod ? <span className="badge gold">{t('common.yes')}</span> : t('common.no')],
                      [t('bo.queue.flags'), <AppFlags a={{ ...a, sod: a.child.sod }} />],
                    ]} />
                    <Kv items={[
                      [t('bo.f.home_area'), `${L(fam, 'area') || '—'} · ${fam.emirate || ''}`],
                      [t('bo.f.makani'), fam.makani],
                      [t('bo.f.residence_route'), t(`bo.residence.${a.residence_route || 'own'}`)],
                      [t('bo.f.transport'), a.transport_mode ? t(`transport.${a.transport_mode}`) : '—'],
                      a.bus && [t('bo.f.bus'), <span>{a.bus.route_code} · {L(a.bus, 'stop') || ''} {a.bus.status && <StatusBadge status={a.bus.status} />}</span>],
                      [t('bo.f.emergency'), fam.emergency_name ? `${fam.emergency_name} · ${fam.emergency_mobile}` : '—'],
                      [t('bo.f.sole_custody'), fam.sole_custody ? t('common.yes') : t('common.no')],
                    ]} />
                  </div>
                  <h4 className="mt">{t('bo.review.guardians')}</h4>
                  <DataTable rows={d.guardians} columns={[
                    { key: 'n', label: t('bo.f.name'), render: (g) => <>{L(g, 'full_name')} {g.is_primary ? <span className="badge gold">{t('bo.review.primary')}</span> : null}</> },
                    { key: 'eid', label: t('bo.f.eid'), render: (g) => <span className="mono small">{g.emirates_id}</span> },
                    { key: 'rel', label: t('bo.f.relationship'), render: (g) => t(`relationship.${g.relationship}`, { default: g.relationship }) },
                    { key: 'nat', label: t('bo.f.nationality'), render: (g) => label('nationality', g.nationality) },
                    { key: 'c', label: t('bo.f.contact'), render: (g) => <span className="small">{g.mobile}<br />{g.email}</span> },
                  ]} />
                  {d.siblings.length > 0 && (
                    <>
                      <h4 className="mt">{t('bo.review.siblings')}</h4>
                      <div className="row">{d.siblings.map((s) => <span key={s.id} className={`badge wrap ${s.school_id === a.current_school_id ? 'blue' : ''}`}>{L(s, 'full_name')}{s.grade ? ` · ${t(`grade.${s.grade}`)} · ${L(s, 'school')}` : ''}</span>)}</div>
                    </>
                  )}
                </Card>

                <Card title={t('bo.review.residence')} actions={<ReqTag id="PP-14" />}>
                  <div className="grid c2">
                    {residence.filter((r) => r !== 'host_documents' || docsBy(r).length).map((r) => {
                      const doc = docsBy(r)[0];
                      return (
                        <div key={r} className="card" style={{ padding: 12, boxShadow: 'none' }}>
                          <div className="row between"><b>{label('doc_type', r)}</b>{doc && <StatusBadge status={doc.status} />}</div>
                          {doc ? (
                            <>
                              <Kv items={[[t('bo.f.ref_number'), doc.ref_number], [t('bo.f.issue_date'), fmtDate(doc.issue_date)], [t('bo.f.expiry'), fmtDate(doc.expiry_date)]]} />
                              <button className="btn secondary sm mt" onClick={() => setPreview(doc)}>{t('common.preview')}</button>
                            </>
                          ) : <div className="muted small">{t('bo.review.not_uploaded')}</div>}
                        </div>
                      );
                    })}
                  </div>
                </Card>

                <Card title={t('bo.review.documents')} actions={<ReqTag id="SB-03" />}>
                  <DataTable rows={d.checklist} columns={[
                    { key: 'doc', label: t('bo.review.document'), render: (c) => <>{label('doc_type', c.doc_type)}<div className="small muted">{t(`docreq.${c.requirement}`)}{c.reused ? ` · ${t('bo.review.reused')}` : ''}</div></> },
                    { key: 'file', label: t('bo.review.file'), render: (c) => c.document ? <button className="btn ghost sm" onClick={() => setPreview(c.document)}>{c.document.filename}</button> : <span className={c.needed ? 'badge red' : 'muted small'}>{c.needed ? t('bo.review.missing') : '—'}</span> },
                    { key: 'st', label: t('common.status'), render: (c) => c.document ? <><StatusBadge status={c.document.status} />{c.document.reject_reason && <div className="small muted">{label('reject_reason', c.document.reject_reason)}</div>}</> : c.last_rejected ? <span className="small">{t('status.rejected')}: {label('reject_reason', c.last_rejected.reject_reason)}</span> : null },
                    {
                      key: 'act', label: t('common.actions'), render: (c) => c.document && d.can.decide && (
                        <span className="row" style={{ gap: 4 }}>
                          <button className="btn success sm" disabled={busy || c.document.status === 'accepted'} onClick={() => act(`/documents/${c.document.id}/decision`, { status: 'accepted' }, 'bo.review.doc_accepted')}>{t('common.accept')}</button>
                          <button className="btn danger sm" disabled={busy} onClick={() => { setForm({ docId: c.document.id }); setModal('docReject'); }}>{t('common.reject')}</button>
                        </span>
                      ),
                    },
                  ]} />
                </Card>

                <Card title={t('bo.review.map')} actions={<ReqTag id="SB-02" />}>
                  <MapView home={home} schools={schoolsOnMap} polygons={cur ? [{ geojson: cur.geojson, label: L(cur), fit: true }] : []} fitTo="all" />
                  <ol className="small mt">
                    {a.preferences.map((p) => <li key={p.id} style={{ fontWeight: p.current ? 600 : 400 }}>{L(p)} {p.current && <span className="badge gold">{t('bo.review.current')}</span>} {a.sibling_school_ids.includes(p.id) && <span className="badge blue">{t('bo.flag.sibling_short')}</span>}</li>)}
                  </ol>
                </Card>
              </div>

              <div className="stack">
                {d.can.decide && (
                  <Card title={t('bo.review.decision')} actions={<ReqTag id="SB-04" />}>
                    <div className="stack">
                      <button className="btn success" style={{ width: '100%' }} disabled={busy} onClick={() => { setForm({ sectionId: d.seats.filter((s) => s.available > 0).sort((x, y) => y.available - x.available)[0]?.id || '' }); setModal('offer'); }}>{t('bo.review.offer')}</button>
                      <button className="btn secondary" style={{ width: '100%' }} disabled={busy} onClick={() => { setForm({ reason: 'missing_document', docTypes: [] }); setModal('info'); }}>{t('bo.review.request_info')}</button>
                      <button className="btn secondary" style={{ width: '100%' }} disabled={busy} onClick={() => setModal('pass')}>{t('bo.review.pass')}</button>
                      <button className="btn secondary" style={{ width: '100%' }} disabled={busy} onClick={() => setModal('escalate')}>{t('bo.review.escalate')}</button>
                      <button className="btn danger" style={{ width: '100%' }} disabled={busy} onClick={() => { setForm({ reason: '' }); setModal('reject'); }}>{t('common.reject')}</button>
                    </div>
                    <p className="small muted mt">{t('bo.review.sla_note', { date: fmtDateTime(a.sla_due_at) })}</p>
                  </Card>
                )}
                {d.can.cluster && (
                  <Card title={t('bo.review.cluster_actions')} actions={<ReqTag id="SB-07" />}>
                    <div className="stack">
                      {a.status === 'escalated' && a.escalation_reason !== 'no_seat' && a.escalation_reason !== 'school' && (
                        <button className="btn success" style={{ width: '100%' }} disabled={busy} onClick={() => setModal('approve')}>{t('bo.review.approve')}</button>
                      )}
                      <button className="btn" style={{ width: '100%' }} disabled={busy} onClick={() => { setForm({ schoolId: '', sectionId: '' }); setModal('place'); }}>{t('bo.review.place')}</button>
                      <button className="btn danger" style={{ width: '100%' }} disabled={busy} onClick={() => { setForm({ reason: '' }); setModal('reject'); }}>{t('common.reject')}</button>
                    </div>
                  </Card>
                )}
                {d.can.force && (
                  <Card title={t('bo.force.title')} actions={<ReqTag id="CC-06" />}>
                    <p className="small">{t('bo.force.text')}</p>
                    <button className="btn dark" style={{ width: '100%' }} onClick={() => { setForm({ sectionId: d.seats[0]?.id, reason: '' }); setModal('force'); }}>{t('bo.force.button')}</button>
                  </Card>
                )}

                <Card title={t('bo.review.seats', { grade: t(`grade.${a.grade}`) })} actions={<ReqTag id="CC-02" />}>
                  <DataTable rows={d.seats} columns={[
                    { key: 'name', label: t('common.section') },
                    { key: 'capacity', label: t('col.capacity'), num: true },
                    { key: 'used', label: t('bo.cap.used'), num: true },
                    { key: 'available', label: t('col.available'), num: true, render: (s) => <b style={{ color: s.available > 0 ? 'var(--green-700)' : 'var(--red-700)' }}>{s.available}</b> },
                  ]} />
                </Card>

                <Card title={t('bo.review.priority')} actions={<ReqTag id="BR-05" />}>
                  <ol className="small" style={{ margin: 0, paddingInlineStart: 18 }}>
                    {d.priority.order.map((k) => <li key={k}>{t(`bo.prio.${k}`)}: <b>{factors[k]}</b></li>)}
                  </ol>
                </Card>

                <Card title={t('bo.review.timeline')} actions={<ReqTag id="SB-09" />}>
                  <Timeline events={d.timeline} />
                </Card>
              </div>
            </div>

            {preview && <DocPreview doc={preview} onClose={() => setPreview(null)} />}

            {modal === 'docReject' && (
              <Modal title={t('bo.review.reject_doc')} onClose={() => setModal(null)} footer={<button className="btn danger" disabled={!form.reason || busy} onClick={() => act(`/documents/${form.docId}/decision`, { status: 'rejected', reason: form.reason }, 'bo.review.doc_rejected')}>{t('common.reject')}</button>}>
                <Field label={t('common.reason')} required><select value={form.reason || ''} onChange={setF('reason')}><option value="" />{listOf('reject_reason').slice(0, 5).map((r) => <option key={r.code} value={r.code}>{L(r, 'label')}</option>)}</select></Field>
              </Modal>
            )}
            {modal === 'offer' && (
              <Modal title={t('bo.review.offer')} onClose={() => setModal(null)} footer={<button className="btn success" disabled={busy || !form.sectionId} onClick={() => act(`/applications/${a.id}/offer`, { sectionId: Number(form.sectionId) }, 'bo.review.offer_done')}>{t('bo.review.offer')}</button>}>
                <p className="small">{t('bo.review.offer_text')}</p>
                <Field label={`${t('common.grade')} ${t(`grade.${a.grade}`)} – ${t('common.section')}`} required>
                  <select value={form.sectionId} onChange={setF('sectionId')}>
                    {d.seats.map((s) => <option key={s.id} value={s.id} disabled={s.available <= 0}>{s.name} · {t('bo.review.available_n', { n: s.available })}</option>)}
                  </select>
                </Field>
              </Modal>
            )}
            {modal === 'info' && (
              <Modal title={t('bo.review.request_info')} onClose={() => setModal(null)} footer={<button className="btn" disabled={busy || !form.reason} onClick={() => act(`/applications/${a.id}/request-info`, { reason: form.reason, note: form.note, docTypes: form.docTypes }, 'bo.review.info_done')}>{t('common.submit')}</button>}>
                <div className="alert info small mb">{t('bo.review.info_text')} <ReqTag id="BR-07" /></div>
                <div className="stack">
                  <Field label={t('common.reason')} required><select value={form.reason} onChange={setF('reason')}>{listOf('info_reason').map((r) => <option key={r.code} value={r.code}>{L(r, 'label')}</option>)}</select></Field>
                  <Field label={t('bo.review.doc_types')}>
                    <div className="grid c2 small">
                      {listOf('doc_type').map((r) => (
                        <label key={r.code} className="check"><input type="checkbox" checked={form.docTypes?.includes(r.code)} onChange={(e) => setForm((x) => ({ ...x, docTypes: e.target.checked ? [...x.docTypes, r.code] : x.docTypes.filter((c) => c !== r.code) }))} />{L(r, 'label')}</label>
                      ))}
                    </div>
                  </Field>
                  <Field label={t('bo.review.message_parent')}><textarea rows={3} value={form.note || ''} onChange={setF('note')} /></Field>
                </div>
              </Modal>
            )}
            {modal === 'pass' && (
              <Modal title={t('bo.review.pass')} onClose={() => setModal(null)} footer={<button className="btn" disabled={busy} onClick={() => act(`/applications/${a.id}/pass`, { note: form.note }, 'bo.review.pass_done')}>{t('common.confirm')}</button>}>
                <p className="small">{t('bo.review.pass_text')}</p>
                <Field label={t('common.note')}><textarea rows={2} value={form.note || ''} onChange={setF('note')} /></Field>
              </Modal>
            )}
            {modal === 'escalate' && (
              <Modal title={t('bo.review.escalate')} onClose={() => setModal(null)} footer={<button className="btn" disabled={busy} onClick={() => act(`/applications/${a.id}/escalate`, { note: form.note }, 'bo.review.escalate_done')}>{t('common.confirm')}</button>}>
                <Field label={t('common.note')}><textarea rows={3} value={form.note || ''} onChange={setF('note')} /></Field>
              </Modal>
            )}
            {modal === 'reject' && (
              <Modal title={t('bo.review.reject_app')} onClose={() => setModal(null)} footer={<button className="btn danger" disabled={busy || !form.reason} onClick={() => act(`/applications/${a.id}/reject`, { reason: form.reason, note: form.note }, 'bo.review.reject_done')}>{t('common.reject')}</button>}>
                <div className="stack">
                  <Field label={t('common.reason')} required><select value={form.reason} onChange={setF('reason')}><option value="" />{listOf('reject_reason').map((r) => <option key={r.code} value={r.code}>{L(r, 'label')}</option>)}</select></Field>
                  <Field label={t('common.note')}><textarea rows={2} value={form.note || ''} onChange={setF('note')} /></Field>
                </div>
              </Modal>
            )}
            {modal === 'approve' && (
              <Modal title={t('bo.review.approve')} onClose={() => setModal(null)} footer={<button className="btn success" disabled={busy} onClick={() => act(`/applications/${a.id}/cluster-approve`, { note: form.note }, 'bo.review.approve_done')}>{t('common.confirm')}</button>}>
                <p className="small">{t('bo.review.approve_text', { school: L(a.school) })}</p>
                <Field label={t('common.note')}><textarea rows={2} value={form.note || ''} onChange={setF('note')} /></Field>
              </Modal>
            )}
            {modal === 'place' && <PlaceModal a={a} schools={clusterSchools} busy={busy} onClose={() => setModal(null)} onPlace={(body) => act(`/applications/${a.id}/cluster-place`, body, 'bo.review.place_done')} />}
            {modal === 'force' && (
              <Modal title={t('bo.force.title')} onClose={() => setModal(null)} footer={<button className="btn dark" disabled={busy || !form.sectionId || (form.reason || '').trim().length < 5} onClick={async () => {
                try { await run(() => api.post('/admin/force-register', { appId: a.id, sectionId: Number(form.sectionId), reason: form.reason }), t('bo.force.done')); setModal(null); st.reload(); } catch { /* toast shown */ }
              }}>{t('bo.force.button')}</button>}>
                <div className="alert warn small mb">{t('bo.force.warning')}</div>
                <div className="stack">
                  <Field label={t('common.section')} required><select value={form.sectionId} onChange={setF('sectionId')}>{d.seats.map((s) => <option key={s.id} value={s.id}>{s.name} · {t('bo.review.available_n', { n: s.available })}</option>)}</select></Field>
                  <Field label={t('common.reason')} required hint={t('bo.force.reason_hint')}><textarea rows={3} value={form.reason} onChange={setF('reason')} /></Field>
                </div>
              </Modal>
            )}
          </>
        );
      }}
    </Loader>
  );
}

function PlaceModal({ a, schools, busy, onClose, onPlace }) {
  const { t, L } = useI18n();
  const [schoolId, setSchoolId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [note, setNote] = useState('');
  const cap = useAsync(() => (schoolId ? api.get(`/schools/${schoolId}/capacity?ay=${a.ay}`) : Promise.resolve(null)), [schoolId]);
  const grade = cap.data?.grades?.find((g) => g.grade === a.grade);
  return (
    <Modal title={t('bo.review.place')} onClose={onClose} footer={<button className="btn" disabled={busy || !schoolId || (grade && grade.available <= 0)} onClick={() => onPlace({ schoolId: Number(schoolId), sectionId: sectionId ? Number(sectionId) : undefined, note })}>{t('bo.review.place')}</button>}>
      <p className="small">{t('bo.review.place_text')}</p>
      <div className="stack">
        <Field label={t('common.school')} required>
          <select value={schoolId} onChange={(e) => { setSchoolId(e.target.value); setSectionId(''); }}>
            <option value="" />
            {schools.map((s) => <option key={s.id} value={s.id}>{L(s)}</option>)}
          </select>
        </Field>
        {schoolId && !cap.loading && !grade && <div className="alert error small">{t('bo.review.grade_not_offered')}</div>}
        {grade && (
          <Field label={t('common.section')} hint={t('bo.review.available_n', { n: grade.available })}>
            <select value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
              <option value="">{t('bo.review.auto_section')}</option>
              {grade.sections.map((s) => <option key={s.id} value={s.id} disabled={s.available <= 0}>{s.name} · {t('bo.review.available_n', { n: s.available })}</option>)}
            </select>
          </Field>
        )}
        <Field label={t('common.note')}><textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
