// Leaving request (PP-21): reason, sub-reason (section 5.2), leaving date and destination.
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useI18n } from '../../i18n.jsx';
import { useAuth } from '../../auth.jsx';
import { useAsync, Loader, PageHead, Card, Field, Kv, useAction, ReqTag } from '../../components/ui.jsx';
import { gradeLabel } from './shared.jsx';

export default function Leave() {
  const { id } = useParams();
  const { t, L, fmtDate } = useI18n();
  const { listOf, lookups } = useAuth();
  const st = useAsync(() => api.get('/family'), []);
  const [f, setF] = useState({ reason: '', subreason: '', note: '', leaveDate: lookups.today, destination: '' });
  const [done, setDone] = useState(null);
  const [run, busy] = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value, ...(k === 'reason' ? { subreason: '' } : {}) });

  return (
    <Loader state={st}>
      {(d) => {
        const c = d.children.find((x) => x.id === Number(id));
        if (!c) return <div className="alert error">{t('error.not_found')}</div>;
        const subs = f.reason ? listOf('leave_subreason', f.reason) : [];
        // a reason with sub-reasons needs one; a reason without (e.g. Other) needs details (BR-13)
        const needsNote = !!f.reason && subs.length === 0;
        const valid = f.reason && f.leaveDate && (needsNote ? f.note.trim() : f.subreason);
        const submit = () => run(async () => setDone(await api.post(`/family/children/${c.id}/leave`, f)));
        if (done) {
          return (
            <Card>
              <div className="alert success"><div><b>{t('parent.leave.done_title')}</b><div className="small">{t('parent.leave.done_text', { name: L(c, 'full_name'), date: fmtDate(done.leave_date) })}</div></div></div>
              <Link className="btn mt" to="/parent">{t('parent.addchild.to_family')}</Link>
            </Card>
          );
        }
        return (
          <>
            <PageHead title={t('parent.leave.title', { name: L(c, 'full_name') })} sub={t('parent.leave.sub')} reqs={['PP-21', 'BR-13']} />
            <Card>
              {c.enrolment && <Kv items={[[t('parent.child.current'), `${L(c.enrolment, 'school')} · ${gradeLabel(t, c.enrolment.grade)}`]]} />}
              {!c.can_leave && <div className="alert warn small mt">{t('parent.leave.not_available')}</div>}
              <div className="form-grid mt">
                <Field label={t('col.reason')} required>
                  <select value={f.reason} onChange={set('reason')}>
                    <option value="">—</option>
                    {listOf('leave_reason').map((r) => <option key={r.code} value={r.code}>{L(r, 'label')}</option>)}
                  </select>
                </Field>
                {subs.length > 0 && (
                  <Field label={t('col.subreason')} required>
                    <select value={f.subreason} onChange={set('subreason')}>
                      <option value="">—</option>
                      {subs.map((r) => <option key={r.code} value={r.code}>{L(r, 'label')}</option>)}
                    </select>
                  </Field>
                )}
                <Field label={t('parent.leave.date')} required><input type="date" value={f.leaveDate} min={lookups.today} onChange={set('leaveDate')} /></Field>
                <Field label={t('parent.leave.destination')} hint={t('parent.leave.destination_hint')}><input value={f.destination} onChange={set('destination')} /></Field>
              </div>
              {(needsNote || f.subreason.endsWith('other')) && (
                <Field label={t('parent.leave.details')} required={needsNote}><textarea rows={2} value={f.note} onChange={set('note')} /></Field>
              )}
              <div className="alert info small mt">{t('parent.leave.note')} <ReqTag id="SB-08" /></div>
              <div className="row mt">
                <button className="btn danger" disabled={!valid || !c.can_leave || busy} onClick={submit}>{t('parent.leave.submit')}</button>
                <Link className="btn secondary" to="/parent">{t('common.cancel')}</Link>
              </div>
            </Card>
          </>
        );
      }}
    </Loader>
  );
}
