// Application wizard (PP-08 .. PP-17, PP-22): eligibility → home & residence → schools →
// documents → transport → review & submit.
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, qs, fileUrl } from '../../api.js';
import { useI18n } from '../../i18n.jsx';
import { useAuth } from '../../auth.jsx';
import { useAsync, Loader, PageHead, Card, Field, Kv, Modal, SeatBadge, StatusBadge, FilePick, useAction, Spinner, ReqTag } from '../../components/ui.jsx';
import MapView from '../../components/MapView.jsx';
import { gradeLabel } from './shared.jsx';

const STEPS = ['eligibility', 'home', 'schools', 'documents', 'transport', 'review'];
export const CHILD_DOCS = ['child_eid', 'child_passport', 'birth_certificate', 'child_photo', 'vaccination', 'school_reports', 'transfer_certificate', 'equivalency', 'sod_reports', 'exceptional_support'];

export default function Apply() {
  const { id } = useParams();
  const { t } = useI18n();
  const st = useAsync(() => Promise.all([api.get(`/family/applications/${id}`), api.get('/family')]).then(([a, f]) => ({ ...a, fam: f })), [id]);
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(null);

  if (done) return <Submitted app={done} />;
  return (
    <>
      <PageHead title={t('parent.apply.title')} sub={t('parent.apply.sub')} reqs={['PP-10', 'PP-13', 'PP-15', 'PP-16', 'PP-17']} />
      <Loader state={st}>
        {(d) => d.app.status !== 'draft' ? (
          <div className="alert info">{t('parent.apply.not_draft')} <Link to={`/parent/applications/${d.app.id}`}>{t('parent.child.track')} →</Link></div>
        ) : (
          <>
            <div className="steps">
              {STEPS.map((s, i) => (
                <div key={s} className={`step ${i < step ? 'done' : i === step ? 'current' : ''}`} onClick={() => i < step && setStep(i)} style={{ cursor: i < step ? 'pointer' : 'default' }}>
                  <div className="dot">{i < step ? '✓' : i + 1}</div>
                  <div>{t(`parent.apply.step.${s}`)}</div>
                </div>
              ))}
            </div>
            {step === 0 && <StepEligibility d={d} next={() => setStep(1)} />}
            {step === 1 && <StepHome d={d} reload={st.reload} back={() => setStep(0)} next={() => setStep(2)} />}
            {step === 2 && <StepSchools d={d} reload={st.reload} back={() => setStep(1)} next={() => setStep(3)} />}
            {step === 3 && <StepDocuments d={d} reload={st.reload} back={() => setStep(2)} next={() => setStep(4)} />}
            {step === 4 && <StepTransport d={d} reload={st.reload} back={() => setStep(3)} next={() => setStep(5)} />}
            {step === 5 && <StepReview d={d} reload={st.reload} back={() => setStep(4)} goto={setStep} onSubmitted={setDone} />}
          </>
        )}
      </Loader>
    </>
  );
}

function Nav({ back, next, nextLabel, disabled, busy }) {
  const { t } = useI18n();
  return (
    <div className="row between mt">
      {back ? <button className="btn secondary" onClick={back}>← {t('common.back')}</button> : <span />}
      {next && <button className="btn" disabled={disabled || busy} onClick={next}>{nextLabel || t('common.next')} →</button>}
    </div>
  );
}

/* ---------- 1. eligibility / pathway (PP-05, PP-09, PP-22) ---------- */
function StepEligibility({ d, next }) {
  const { t, L, fmtDate } = useI18n();
  const a = d.app, c = a.child;
  return (
    <Card title={t('parent.apply.step.eligibility')}>
      <Kv items={[
        [t('parent.apply.child'), `${L(c, 'full_name')} · ${c.emirates_id}`],
        [t('parent.addchild.dob'), fmtDate(c.dob)],
        [t('parent.apply.pathway'), t(`pathway.${a.pathway}`)],
        [t('parent.apply.type'), t(`type.${a.type}`)],
        [t('parent.apply.grade'), <b>{t('parent.elig.text', { grade: gradeLabel(t, a.grade), ay: a.ay })} · {t(`cycle.${a.cycle}`)}</b>],
      ]} />
      <p className="small muted mt">{a.type === 'new' ? t('parent.apply.rule_new') : t('parent.apply.rule_transfer')} <ReqTag id={a.type === 'new' ? 'BR-01' : 'BR-02'} /></p>
      {a.renewal_of_enrolment_id && <div className="alert gold small mt">{t('parent.apply.from_renewal')} <ReqTag id="PP-19" /></div>}
      {a.exceptional ? <div className="alert warn small mt">{t('parent.apply.exceptional_note')} <ReqTag id="PP-22" /></div> : null}
      <Nav next={next} />
    </Card>
  );
}

/* ---------- 2. home & residence (PP-08, PP-14) ---------- */
function StepHome({ d, reload, back, next }) {
  const { t, L } = useI18n();
  const [run, busy] = useAction();
  const f = d.fam.family;
  const route = d.app.residence_route || 'own';
  const setRoute = (r) => run(async () => { await api.patch(`/family/applications/${d.app.id}`, { residence_route: r }); await reload(); });
  if (!f.residence_confirmed) {
    return (
      <Card title={t('parent.apply.step.home')}>
        <div className="alert warn">{t('parent.family.no_home')}</div>
        <Link className="btn mt" to={`/parent/home-location?next=/parent/apply/${d.app.id}`}>{t('parent.family.set_home')}</Link>
        <Nav back={back} />
      </Card>
    );
  }
  return (
    <Card title={t('parent.apply.step.home')}>
      <div className="grid c2">
        <div>
          <MapView className="short" center={[f.home_lat, f.home_lng]} zoom={14} home={{ lat: f.home_lat, lng: f.home_lng }} />
        </div>
        <div className="stack">
          <Kv items={[[t('common.emirate'), f.emirate], [t('parent.home.area'), L(f, 'area')], [t('parent.home.makani'), <span className="mono">{f.makani}</span>]]} />
          <p className="small muted">{t('parent.apply.home_used')}</p>
          <Link className="small" to={`/parent/home-location?next=/parent/apply/${d.app.id}`}>{t('parent.family.change_home')} →</Link>
          <h4>{t('parent.apply.residence_route')} <ReqTag id="PP-14" /></h4>
          {['own', 'relatives', 'employer'].map((r) => (
            <label key={r} className="check small">
              <input type="radio" name="route" checked={route === r} disabled={busy} onChange={() => setRoute(r)} />
              <span>{t(`parent.residence.${r}`)}</span>
            </label>
          ))}
          {route !== 'own' && <div className="alert warn small">{t('parent.apply.alt_route_note')}</div>}
        </div>
      </div>
      <Nav back={back} next={next} />
    </Card>
  );
}

/* ---------- 3. schools (PP-10, PP-11, PP-12, BR-03, BR-04) ---------- */
function StepSchools({ d, reload, back, next }) {
  const { t, L, fmtNum } = useI18n();
  const a = d.app;
  const el = useAsync(() => api.get(`/family/eligible-schools${qs({ grade: a.grade, childId: a.child_id })}`), [a.id]);
  const catchments = useAsync(() => api.get('/lookups/catchments'), []);
  const [prefs, setPrefs] = useState(a.preferences.map((p) => p.id));
  const [run, busy] = useAction();
  const max = el.data?.max_preferences || 3;

  const toggle = (id) => setPrefs((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < max ? [...p, id] : p));
  const move = (i, dir) => setPrefs((p) => { const n = [...p]; [n[i], n[i + dir]] = [n[i + dir], n[i]]; return n; });
  const save = () => run(async () => { await api.patch(`/family/applications/${a.id}`, { preferences: prefs }); await reload(); next(); });

  return (
    <Loader state={el}>
      {(e) => {
        const all = [...e.eligible, ...e.alternatives];
        const byId = Object.fromEntries(all.map((s) => [s.id, s]));
        const ids = new Set(all.map((s) => s.id));
        const polygons = (catchments.data || []).filter((c) => e.eligible.some((s) => s.id === c.school_id)).map((c) => ({ geojson: c.geojson, label: L(c), color: '#92722a' }));
        const schoolRow = (s) => {
          const rank = prefs.indexOf(s.id);
          const full = s.seat_status === 'full';
          return (
            <div key={s.id} className="card" style={{ padding: 12, marginTop: 8, opacity: full ? 0.6 : 1, borderColor: rank >= 0 ? 'var(--gold-500)' : undefined }}>
              <div className="row between">
                <div style={{ minWidth: 0 }}>
                  <b>{L(s)}</b>
                  <div className="small muted">{L(s, 'area')} · {fmtNum(s.distance_km, 1)} {t('common.km')} · {s.cycles.map((c) => t(`cycle.${c}`).split(' (')[0]).join(', ')}</div>
                  <div className="row small" style={{ marginTop: 4, gap: 6 }}>
                    <SeatBadge status={s.seat_status} />
                    {s.seat_status !== 'full' && <span className="muted">{t('parent.apply.seats_left', { n: s.seats_available })}</span>}
                    <span className={`badge ${s.bus_served ? 'blue' : ''}`}>{s.bus_served ? t('parent.apply.bus_yes') : t('parent.apply.bus_no')}</span>
                    {s.sibling && <span className="badge green">{t('parent.apply.sibling_here')}</span>}
                    {s.cluster_approval_required && <span className="badge amber">{t('parent.apply.cluster_required')}</span>}
                  </div>
                </div>
                {full ? <span className="small muted">{t('parent.apply.closed_full')}</span> : (
                  <button className={`btn sm ${rank >= 0 ? '' : 'secondary'}`} onClick={() => toggle(s.id)} disabled={rank < 0 && prefs.length >= max}>
                    {rank >= 0 ? t('parent.apply.choice_n', { n: rank + 1 }) : t('parent.apply.add_choice')}
                  </button>
                )}
              </div>
            </div>
          );
        };
        return (
          <div className="row" style={{ alignItems: 'flex-start', gap: 16 }}>
            <div style={{ flex: '3 1 420px', minWidth: 0 }}>
              <Card title={t('parent.apply.eligible_title', { grade: gradeLabel(t, a.grade) })}>
                <p className="small muted">{t('parent.apply.eligible_note', { area: L(e.location, 'area') || '—' })} <ReqTag id="BR-03" /></p>
                {e.eligible.length === 0 && <div className="alert warn small">{t('parent.apply.none_in_catchment')}</div>}
                {e.eligible.map(schoolRow)}
                {!e.any_seat && (
                  <>
                    <div className="alert warn small mt">{t('parent.apply.no_seat_alt')} <ReqTag id="PP-11" /></div>
                    {e.alternatives.length === 0 ? <p className="small muted">{t('parent.apply.no_alternatives')}</p> : e.alternatives.map(schoolRow)}
                  </>
                )}
              </Card>
            </div>
            <div style={{ flex: '2 1 300px', minWidth: 0 }}>
              <Card title={t('parent.apply.your_ranking', { max })}>
                {prefs.length === 0 && <p className="small muted">{t('parent.apply.pick_hint')}</p>}
                {prefs.map((pid, i) => (
                  <div key={pid} className="row between small" style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                    <span><b>{i + 1}.</b> {byId[pid] ? L(byId[pid]) : '—'} {byId[pid]?.sibling && <span className="badge green">{t('parent.apply.sibling_here')}</span>}</span>
                    <span className="row" style={{ gap: 2 }}>
                      <button className="btn ghost sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label="up">▲</button>
                      <button className="btn ghost sm" disabled={i === prefs.length - 1} onClick={() => move(i, 1)} aria-label="down">▼</button>
                      <button className="btn ghost sm" onClick={() => toggle(pid)} aria-label="remove">✕</button>
                    </span>
                  </div>
                ))}
                {prefs.some((p) => !ids.has(p)) && <div className="alert error small mt">{t('parent.apply.pref_invalid')}</div>}
                <p className="small muted mt">{t('parent.apply.ranking_note')} <ReqTag id="PP-12" /> <ReqTag id="BR-05" /></p>
              </Card>
              <Card style={{ marginTop: 16 }}>
                <MapView className="short" home={{ lat: d.fam.family.home_lat, lng: d.fam.family.home_lng }} polygons={polygons} fitTo="all"
                  schools={all.map((s) => ({ ...s, label: L(s), short: prefs.includes(s.id) ? String(prefs.indexOf(s.id) + 1) : '•', highlight: prefs.includes(s.id) }))} />
              </Card>
              <Nav back={back} next={save} busy={busy} disabled={!prefs.length || prefs.some((p) => !ids.has(p))} nextLabel={t('parent.apply.save_continue')} />
            </div>
          </div>
        );
      }}
    </Loader>
  );
}

/* ---------- 4. documents (PP-13, PP-14, BR-10, PP-22) ---------- */
function StepDocuments({ d, reload, back, next }) {
  const { t, L, fmtDate } = useI18n();
  const { listOf } = useAuth();
  const a = d.app;
  const [upFor, setUpFor] = useState(null);
  const [run, busy] = useAction();
  const missing = d.checklist.filter((c) => !c.satisfied);
  const setReason = (v) => run(async () => { await api.patch(`/family/applications/${a.id}`, { exceptional_reason: v }); await reload(); });
  return (
    <Card title={t('parent.apply.step.documents')}>
      <p className="small muted">{t('parent.apply.docs_note')} <ReqTag id="PP-13" /> <ReqTag id="PP-14" /></p>
      {a.exceptional ? (
        <div className="alert warn mb" style={{ display: 'block' }}>
          <b>{t('parent.apply.exceptional_title')}</b> <ReqTag id="PP-22" />
          <div className="small">{t('parent.apply.exceptional_doc_note')}</div>
          <Field label={t('parent.apply.exceptional_reason')} required>
            <select value={a.exceptional_reason || ''} disabled={busy} onChange={(e) => setReason(e.target.value)} style={{ maxWidth: 380 }}>
              <option value="">—</option>
              {listOf('exceptional_reason').map((r) => <option key={r.code} value={r.code}>{L(r, 'label')}</option>)}
            </select>
          </Field>
        </div>
      ) : null}
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>{t('parent.docs.document')}</th><th>{t('parent.docs.requirement')}</th><th>{t('common.status')}</th><th /></tr></thead>
          <tbody>
            {d.checklist.map((c) => (
              <tr key={c.doc_type}>
                <td><b>{L(c.label, 'label')}</b>{c.document && <div className="small muted">{c.document.filename}{c.document.expiry_date ? ` · ${t('parent.docs.expires', { date: fmtDate(c.document.expiry_date) })}` : ''}{c.document.ref_number ? ` · ${c.document.ref_number}` : ''}</div>}</td>
                <td><span className={`badge ${c.needed ? 'gold' : ''}`}>{t(`docreq.${c.requirement}`)}</span></td>
                <td className="small">
                  {c.document ? (
                    <span className="row" style={{ gap: 4 }}>
                      <span className="badge green">✓ {c.reused ? t('parent.docs.reused') : t('parent.docs.uploaded')}</span>
                      <a href={fileUrl(c.document.id)} target="_blank" rel="noreferrer">{t('common.preview')}</a>
                    </span>
                  ) : c.expired ? <span className="badge red">{t('parent.docs.expired_upload')}</span>
                    : c.last_rejected ? <span className="badge red">{t('parent.docs.rejected_upload')}</span>
                    : c.needed ? <span className="badge amber">{t('parent.docs.missing')}</span>
                    : <span className="muted">{t('common.optional')}</span>}
                </td>
                <td className="right"><button className={`btn sm ${c.document ? 'secondary' : ''}`} onClick={() => setUpFor(c)}>{c.document ? t('parent.docs.replace') : t('common.upload')}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {missing.length > 0 && <div className="alert warn small mt">{t('parent.apply.docs_missing', { n: missing.length })}</div>}
      <Nav back={back} next={next} disabled={missing.length > 0 || (a.exceptional && !a.exceptional_reason)} />
      {upFor && <UploadModal item={upFor} app={a} onClose={() => setUpFor(null)} onDone={async () => { setUpFor(null); await reload(); }} />}
    </Card>
  );
}

// Upload one document; tenancy / utility bill capture contract / account numbers (PP-14)
export function UploadModal({ item, app, onClose, onDone }) {
  const { t, L } = useI18n();
  const { lookups } = useAuth();
  const [file, setFile] = useState(null);
  const [f, setF] = useState({ ref_number: '', issue_date: '', expiry_date: '' });
  const [run, busy] = useAction();
  const type = item.doc_type;
  const needsRef = ['tenancy', 'utility_bill'].includes(type);
  const needsIssue = type === 'utility_bill';
  const hasExpiry = ['guardian_eid', 'guardian_passport', 'child_eid', 'child_passport', 'tenancy'].includes(type);
  const upload = () => run(async () => {
    await api.upload('/family/documents', {
      doc_type: type, application_id: app.id, child_id: CHILD_DOCS.includes(type) ? app.child_id : undefined,
      ref_number: f.ref_number, issue_date: f.issue_date, expiry_date: f.expiry_date,
    }, file);
    await onDone();
  }, t('parent.docs.upload_ok'));
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal title={L(item.label, 'label') || type} onClose={onClose} footer={
      <>
        <button className="btn secondary" onClick={onClose}>{t('common.cancel')}</button>
        <button className="btn" disabled={!file || busy || (needsRef && !f.ref_number) || (needsIssue && !f.issue_date)} onClick={upload}>{t('common.upload')}</button>
      </>
    }>
      <div className="stack">
        <Field label={t('parent.docs.file')} required hint={t('parent.docs.file_hint', { mb: lookups.settings.max_file_mb })}>
          <FilePick onFile={setFile} maxMb={lookups.settings.max_file_mb} capture={/Mobi|Android/i.test(navigator.userAgent)} />
        </Field>
        {file && <div className="small">📄 {file.name} · {(file.size / 1024).toFixed(0)} KB</div>}
        {needsRef && <Field label={type === 'tenancy' ? t('parent.docs.contract_no') : t('parent.docs.account_no')} required><input value={f.ref_number} onChange={set('ref_number')} /></Field>}
        {needsIssue && <Field label={t('parent.docs.issue_date')} required hint={t('parent.docs.bill_hint', { m: lookups.settings.utility_bill_max_age_months })}><input type="date" value={f.issue_date} onChange={set('issue_date')} /></Field>}
        {hasExpiry && <Field label={t('parent.docs.expiry_date')}><input type="date" value={f.expiry_date} onChange={set('expiry_date')} /></Field>}
        {needsRef && <p className="small muted">{t('parent.docs.guardian_name_note')}</p>}
      </div>
    </Modal>
  );
}

/* ---------- 5. transport (PP-15, BR-09) ---------- */
function StepTransport({ d, reload, back, next }) {
  const { t, L, fmtNum } = useI18n();
  const a = d.app;
  const first = a.preferences[0]?.id;
  const bus = useAsync(() => (first ? api.get(`/family/transport/nearest${qs({ schoolId: first })}`) : Promise.resolve({ served: false })), [first]);
  const [mode, setMode] = useState(a.transport_mode || '');
  const [run, busy] = useAction();
  const save = () => run(async () => { await api.patch(`/family/applications/${a.id}`, { transport_mode: mode }); await reload(); next(); });
  const b = bus.data;
  return (
    <Card title={t('parent.apply.step.transport')}>
      <p className="small muted">{t('parent.apply.transport_note', { school: L(a.preferences[0]) })} <ReqTag id="PP-15" /></p>
      <div className="grid c2">
        <div className="stack">
          {['bus', 'dropoff', 'walk', 'private'].map((m) => (
            <label key={m} className="check">
              <input type="radio" name="mode" checked={mode === m} disabled={m === 'bus' && b && !b.served} onChange={() => setMode(m)} />
              <span>{t(`transport.${m}`)}{m === 'bus' && b && !b.served && <span className="small muted"> — {t('parent.apply.bus_not_served')}</span>}</span>
            </label>
          ))}
        </div>
        <div>
          {bus.loading ? <Spinner /> : b?.served && (
            <div className="card" style={{ padding: 12, background: 'var(--blue-50)' }}>
              <h4>{t('parent.apply.bus_details')}</h4>
              <Kv items={[
                [t('parent.apply.route'), `${b.route_code} – ${L(b, 'route')}`],
                [t('parent.apply.stop'), L(b, 'stop')],
                [t('parent.apply.walk'), `${fmtNum(b.walking_m)} m`],
                [t('parent.apply.seat_status'), <span><SeatBadge status={b.seat_status} /> {b.seats_available > 0 && t('parent.apply.seats_left', { n: b.seats_available })}</span>],
              ]} />
              {b.seat_status === 'full' && <div className="alert warn small mt">{t('parent.apply.bus_full')}</div>}
              <p className="small muted mt">{t('parent.apply.bus_hold')} <ReqTag id="BR-09" /></p>
              <MapView className="short" home={{ lat: d.fam.family.home_lat, lng: d.fam.family.home_lng }} stops={[{ lat: b.stop_lat, lng: b.stop_lng, label: L(b, 'stop') }]} fitTo="all" />
            </div>
          )}
        </div>
      </div>
      <Nav back={back} next={save} busy={busy} disabled={!mode} nextLabel={t('parent.apply.save_continue')} />
    </Card>
  );
}

/* ---------- 6. review & submit (PP-16, PP-17) ---------- */
function StepReview({ d, reload, back, goto, onSubmitted }) {
  const { t, L, fmtDate } = useI18n();
  const { label } = useAuth();
  const a = d.app, f = d.fam.family;
  const [decl, setDecl] = useState({ accurate: false, residence: false, rules: false });
  const [run, busy] = useAction();
  const allDecl = Object.values(decl).every(Boolean);
  const submit = () => run(async () => {
    await api.patch(`/family/applications/${a.id}`, { declarations: true });
    const r = await api.post(`/family/applications/${a.id}/submit`);
    onSubmitted(r);
  });
  const Sec = ({ title, step, children }) => (
    <div className="card" style={{ padding: 14, marginTop: 10 }}>
      <div className="row between"><h4 style={{ margin: 0 }}>{title}</h4><button className="btn ghost sm" onClick={() => goto(step)}>✎ {t('common.edit')}</button></div>
      <div className="mt" style={{ marginTop: 8 }}>{children}</div>
    </div>
  );
  return (
    <Card title={t('parent.apply.step.review')}>
      <p className="small muted">{t('parent.apply.review_note')} <ReqTag id="PP-16" /></p>
      <Sec title={t('parent.apply.step.eligibility')} step={0}>
        <Kv items={[
          [t('parent.apply.child'), `${L(a.child, 'full_name')} · ${a.child.emirates_id}`],
          [t('parent.addchild.dob'), fmtDate(a.child.dob)],
          [t('parent.apply.pathway'), t(`pathway.${a.pathway}`)],
          [t('parent.apply.grade'), `${gradeLabel(t, a.grade)} · ${a.ay}`],
          a.exceptional ? [t('parent.apply.exceptional_reason'), a.exceptional_reason ? label('exceptional_reason', a.exceptional_reason) : '—'] : null,
        ]} />
      </Sec>
      <Sec title={t('parent.apply.step.home')} step={1}>
        <Kv items={[[t('parent.home.area'), `${L(f, 'area')} · ${f.emirate}`], [t('parent.home.makani'), f.makani], [t('parent.apply.residence_route'), t(`parent.residence.${a.residence_route || 'own'}`)]]} />
      </Sec>
      <Sec title={t('parent.apply.step.schools')} step={2}>
        <ol className="small" style={{ margin: 0, paddingInlineStart: 20 }}>{a.preferences.map((p) => <li key={p.id}>{L(p)}</li>)}</ol>
        {a.preferences.length === 0 && <span className="badge red">{t('error.no_preferences')}</span>}
      </Sec>
      <Sec title={t('parent.apply.step.documents')} step={3}>
        <div className="row small">
          {d.checklist.map((c) => <span key={c.doc_type} className={`badge ${c.satisfied ? (c.document ? 'green' : '') : 'red'}`}>{c.document ? '✓' : c.satisfied ? '–' : '✕'} {L(c.label, 'label')}</span>)}
        </div>
      </Sec>
      <Sec title={t('parent.apply.step.transport')} step={4}>
        <span className="small">{a.transport_mode ? t(`transport.${a.transport_mode}`) : '—'}{a.bus?.route_code ? ` · ${a.bus.route_code} – ${L(a.bus, 'route')}` : ''}</span>
      </Sec>
      <h4 className="mt">{t('parent.apply.declarations')}</h4>
      {Object.keys(decl).map((k) => (
        <label key={k} className="check small" style={{ marginBottom: 6 }}>
          <input type="checkbox" checked={decl[k]} onChange={(e) => setDecl({ ...decl, [k]: e.target.checked })} />
          <span>{t(`parent.apply.decl.${k}`)}</span>
        </label>
      ))}
      <Nav back={back} next={submit} busy={busy} disabled={!allDecl} nextLabel={t('parent.apply.submit')} />
    </Card>
  );
}

function Submitted({ app }) {
  const { t, L } = useI18n();
  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <Card>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48 }}>✅</div>
          <h1>{t('parent.apply.submitted_title')}</h1>
          <p style={{ fontSize: '1.05rem' }}>{t('parent.apply.submitted_msg')}</p>
          <p>{t('parent.apply.reference')}: <b className="mono" style={{ fontSize: '1.2rem' }}>{app.ref}</b></p>
          <div className="row" style={{ justifyContent: 'center' }}><StatusBadge status={app.status} /> {app.school && <span className="small muted">{L(app.school)}</span>}</div>
          {app.status === 'escalated' && <div className="alert warn small mt">{t('parent.apply.submitted_cluster')}</div>}
          {app.bus?.status && <p className="small muted mt">{t('parent.apply.submitted_bus', { status: t(`status.${app.bus.status}`) })}</p>}
          <p className="small muted">{t('parent.apply.submitted_channels')} <ReqTag id="PP-17" /></p>
          <div className="row mt" style={{ justifyContent: 'center' }}>
            <Link className="btn" to={`/parent/applications/${app.id}`}>{t('parent.child.track')}</Link>
            <Link className="btn secondary" to="/parent">{t('parent.addchild.to_family')}</Link>
          </div>
        </div>
      </Card>
    </div>
  );
}
