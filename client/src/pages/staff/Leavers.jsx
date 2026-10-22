// SB-08 / PP-21: leaving requests, confirmed leavers and leavers this year.
import { useState } from 'react';
import { api, qs } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { useI18n } from '../../i18n.jsx';
import { useAsync, useAction, PageHead, Loader, Tabs, DataTable, Modal, Field, StatusBadge } from '../../components/ui.jsx';

function LeaveForm({ init, onSubmit, onClose, busy, title }) {
  const { t, L } = useI18n();
  const { listOf } = useAuth();
  const [f, setF] = useState({ reason: init.leave_reason || '', subreason: init.leave_subreason || '', leaveDate: init.leave_date || '', destination: init.leave_destination || '', note: init.leave_note || '' });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value, ...(k === 'reason' ? { subreason: '' } : {}) }));
  const subs = listOf('leave_subreason', f.reason);
  // a reason with sub-reasons needs one; a reason without (e.g. Other) needs details (BR-13)
  const needsNote = !!f.reason && subs.length === 0;
  const ok = f.reason && f.leaveDate && (needsNote ? f.note : f.subreason);
  return (
    <Modal title={title} onClose={onClose} footer={<button className="btn" disabled={!ok || busy} onClick={() => onSubmit(f)}>{t('bo.leavers.confirm')}</button>}>
      <div className="alert info small mb">{t('bo.leavers.release_note')}</div>
      <div className="form-grid">
        <Field label={t('col.reason')} required><select value={f.reason} onChange={set('reason')}><option value="" />{listOf('leave_reason').map((r) => <option key={r.code} value={r.code}>{L(r, 'label')}</option>)}</select></Field>
        {!needsNote && <Field label={t('col.subreason')} required><select value={f.subreason} onChange={set('subreason')}><option value="" />{subs.map((r) => <option key={r.code} value={r.code}>{L(r, 'label')}</option>)}</select></Field>}
        <Field label={t('bo.leavers.date')} required><input type="date" value={f.leaveDate} onChange={set('leaveDate')} /></Field>
        <Field label={t('bo.leavers.destination')}><input value={f.destination} onChange={set('destination')} /></Field>
      </div>
      <Field label={needsNote ? t('bo.leavers.details_required') : t('common.note')}><textarea rows={2} value={f.note} onChange={set('note')} /></Field>
    </Modal>
  );
}

export default function Leavers() {
  const { t, L, fmtDate } = useI18n();
  const { me, label } = useAuth();
  const [view, setView] = useState('requests');
  const st = useAsync(() => api.get(`/leavers?view=${view}`), [view]);
  const [run, busy] = useAction();
  const [confirming, setConfirming] = useState(null);
  const [recording, setRecording] = useState(false);
  const [q, setQ] = useState('');
  const found = useAsync(() => (recording && q.length >= 2 ? api.get(`/students${qs({ q })}`) : Promise.resolve([])), [recording, q]);
  const isSchool = ['registrar', 'principal'].includes(me.role);

  const confirm = (enrId, f) => run(() => api.post(`/leavers/${enrId}/confirm`, f), t('bo.leavers.confirmed')).then(() => { setConfirming(null); setRecording(false); st.reload(); }).catch(() => {});

  return (
    <>
      <PageHead title={t('nav.leavers')} sub={me.school ? L(me.school) : ''} reqs={['SB-08', 'PP-21', 'BR-13']}>
        {isSchool && <button className="btn" onClick={() => { setRecording(true); setQ(''); }}>{t('bo.leavers.record')}</button>}
      </PageHead>
      <Tabs tabs={[['requests', t('bo.leavers.tab_requests')], ['leaving', t('bo.leavers.tab_leaving')], ['left', t('bo.leavers.tab_left')]]} value={view} onChange={setView} />
      <Loader state={st}>
        {(rows) => (
          <DataTable rows={rows} columns={[
            { key: 'child', label: t('bo.child'), render: (r) => <>{L(r, 'child')}<div className="mono small muted">{r.emirates_id}</div></> },
            ...(!isSchool ? [{ key: 'school', label: t('common.school'), render: (r) => L(r, 'school') }] : []),
            { key: 'grade', label: t('common.grade'), render: (r) => `${t(`grade.${r.grade}`)}${r.section ? ' – ' + r.section : ''}` },
            { key: 'reason', label: t('col.reason'), render: (r) => <>{label('leave_reason', r.leave_reason)}<div className="small muted">{r.leave_subreason ? label('leave_subreason', r.leave_subreason) : r.leave_note}</div></> },
            { key: 'date', label: t('bo.leavers.date'), render: (r) => fmtDate(r.leave_date) },
            { key: 'dest', label: t('bo.leavers.destination'), render: (r) => r.leave_destination || '—' },
            { key: 'status', label: t('common.status'), render: (r) => view === 'requests' ? <span className="badge amber">{t('bo.leavers.requested', { date: fmtDate(r.leave_requested_at) })}</span> : <StatusBadge status={r.status} /> },
            ...(view === 'requests' && isSchool ? [{ key: 'act', label: '', render: (r) => <button className="btn sm" onClick={() => setConfirming(r)}>{t('bo.leavers.review')}</button> }] : []),
          ]} />
        )}
      </Loader>

      {confirming && <LeaveForm title={`${t('bo.leavers.confirm')} – ${L(confirming, 'child')}`} init={confirming} busy={busy} onClose={() => setConfirming(null)} onSubmit={(f) => confirm(confirming.id, f)} />}
      {recording && !recording.enrolment_id && (
        <Modal title={t('bo.leavers.record')} onClose={() => setRecording(false)}>
          <Field label={t('bo.leavers.find_student')}><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('bo.queue.search_ph')} /></Field>
          <div className="stack mt">
            {(found.data || []).map((s) => (
              <button key={s.enrolment_id} className="btn secondary" style={{ justifyContent: 'space-between', width: '100%' }} onClick={() => setRecording(s)}>
                <span>{L(s, 'full_name')}</span><span className="small muted">{t(`grade.${s.grade}`)} {s.section} · <span className="mono">{s.emirates_id}</span></span>
              </button>
            ))}
          </div>
        </Modal>
      )}
      {recording?.enrolment_id && <LeaveForm title={`${t('bo.leavers.record')} – ${L(recording, 'full_name')}`} init={{}} busy={busy} onClose={() => setRecording(false)} onSubmit={(f) => confirm(recording.enrolment_id, f)} />}
    </>
  );
}
