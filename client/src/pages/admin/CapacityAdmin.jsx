// CC-01 / CC-02 / CC-08 capacity configuration and CC-06 force registration.
import { useState, useEffect } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { useI18n } from '../../i18n.jsx';
import { useAsync, useAction, PageHead, Loader, Card, CapacityBar, Modal, Field, ReqTag } from '../../components/ui.jsx';
import { useReadOnly, ReadOnlyNote } from '../../components/AdminBits.jsx';

function ForceModal({ schoolId, ay, grade, onClose, onDone }) {
  const { t, L } = useI18n();
  const cands = useAsync(() => api.get(`/admin/force-candidates?grade=${grade.grade}&ay=${ay}`), []);
  const [f, setF] = useState({ appId: '', sectionId: grade.seats[0]?.id || '', reason: '' });
  const [run, busy] = useAction();
  const ok = f.appId && f.sectionId && f.reason.trim().length >= 5;
  return (
    <Modal wide title={`${t('bo.force.title')} – ${t(`grade.${grade.grade}`)}`} onClose={onClose}
      footer={<button className="btn dark" disabled={!ok || busy} onClick={() => run(() => api.post('/admin/force-register', { appId: Number(f.appId), sectionId: Number(f.sectionId), reason: f.reason }), t('bo.force.done')).then(onDone).catch(() => {})}>{t('bo.force.button')}</button>}>
      <div className="alert warn small mb">{t('bo.force.warning')} <ReqTag id="CC-06" /> <ReqTag id="A7" /></div>
      <div className="stack">
        <Field label={t('bo.force.application')} required>
          <select value={f.appId} onChange={(e) => setF({ ...f, appId: e.target.value })}>
            <option value="" />
            {(cands.data || []).map((c) => <option key={c.id} value={c.id}>{c.ref} · {L(c, 'child')} · {t(`status.${c.status}`)} · {L(c, 'school')}</option>)}
          </select>
        </Field>
        <Field label={t('common.section')} required>
          <select value={f.sectionId} onChange={(e) => setF({ ...f, sectionId: e.target.value })}>
            {grade.seats.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.used}/{s.capacity}</option>)}
          </select>
        </Field>
        <Field label={t('common.reason')} required hint={t('bo.force.reason_hint')}><textarea rows={3} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

function GradeRow({ g, ro, onSave, canForce, onForce, threshold }) {
  const { t, fmtNum } = useI18n();
  const [v, setV] = useState({ offered: g.offered, sections: g.sections || 1, maxStudents: g.max_students || 25 });
  useEffect(() => setV({ offered: g.offered, sections: g.sections || 1, maxStudents: g.max_students || 25 }), [g]);
  const tot = g.seats.reduce((a, s) => ({ cap: a.cap + s.capacity, en: a.en + s.enrolled, held: a.held + s.held, off: a.off + s.offered, av: a.av + s.available }), { cap: 0, en: 0, held: 0, off: 0, av: 0 });
  const pct = tot.cap ? Math.round(((tot.en + tot.held + tot.off) / tot.cap) * 1000) / 10 : 0;
  const dirty = v.offered !== g.offered || (v.offered && (Number(v.sections) !== g.sections || Number(v.maxStudents) !== g.max_students));
  return (
    <tr style={{ opacity: v.offered ? 1 : 0.55 }}>
      <td><b>{t(`grade.${g.grade}`)}</b></td>
      <td><input type="checkbox" disabled={ro} checked={v.offered} onChange={(e) => setV({ ...v, offered: e.target.checked })} /></td>
      <td style={{ width: 90 }}><input type="number" min="1" max="20" disabled={ro || !v.offered} value={v.sections} onChange={(e) => setV({ ...v, sections: e.target.value })} /></td>
      <td style={{ width: 100 }}><input type="number" min="1" max="60" disabled={ro || !v.offered} value={v.maxStudents} onChange={(e) => setV({ ...v, maxStudents: e.target.value })} /></td>
      <td className="num"><b>{v.offered ? Number(v.sections) * Number(v.maxStudents) : 0}</b></td>
      <td className="num">{tot.en}</td><td className="num">{tot.held}</td><td className="num">{tot.off}</td>
      <td className="num"><b style={{ color: tot.av > 0 ? undefined : 'var(--red-700)' }}>{g.offered ? tot.av : '—'}</b></td>
      <td style={{ minWidth: 120 }}>{g.offered && <><CapacityBar pct={pct} threshold={threshold} /><span className="small">{fmtNum(pct, 1)}%</span></>}</td>
      <td className="nowrap">
        {!ro && dirty && <button className="btn sm" onClick={() => onSave(v)}>{t('common.save')}</button>}
        {canForce && g.offered && tot.av <= 0 && <button className="btn dark sm" onClick={onForce}>{t('bo.force.button')}</button>}
      </td>
    </tr>
  );
}

export default function CapacityAdmin() {
  const { t, L } = useI18n();
  const { me, lookups } = useAuth();
  const ro = useReadOnly();
  const [ay, setAy] = useState(lookups.admission_ay.code);
  const [school, setSchool] = useState(String(lookups.schools[0].id));
  const st = useAsync(() => api.get(`/admin/capacity?ay=${ay}&school=${school}`), [ay, school]);
  const [run] = useAction();
  const [force, setForce] = useState(null);
  const [blocked, setBlocked] = useState(null);

  const save = (g, v) => run(() => api.put('/admin/capacity', { schoolId: Number(school), ay, grade: g.grade, offered: v.offered, sections: Number(v.sections), maxStudents: Number(v.maxStudents) }), t('bo.cap.saved'))
    .then((r) => { setBlocked(r.blocked?.length ? { grade: g.grade, sections: r.blocked } : null); st.reload(); }).catch(() => {});

  return (
    <>
      <PageHead title={t('nav.capacity')} sub={t('bo.cap.admin_sub')} reqs={['CC-01', 'CC-02', 'CC-04', 'CC-06', 'CC-08']}>
        <select style={{ width: 'auto' }} value={school} onChange={(e) => setSchool(e.target.value)}>{lookups.schools.map((s) => <option key={s.id} value={s.id}>{s.code} · {L(s)}</option>)}</select>
        <select style={{ width: 'auto' }} value={ay} onChange={(e) => setAy(e.target.value)}>{[lookups.current_ay.code, lookups.admission_ay.code].map((y) => <option key={y} value={y}>{y}</option>)}</select>
      </PageHead>
      <ReadOnlyNote />
      {blocked && <div className="alert warn mb">{t('bo.cap.blocked', { grade: t(`grade.${blocked.grade}`), sections: blocked.sections.join(', ') })}</div>}
      <Loader state={st}>
        {(rows) => rows.map((s) => (
          <Card key={s.id} title={`${s.code} · ${L(s)}`}>
            <p className="small muted">{t('bo.cap.admin_hint')}</p>
            <div className="table-wrap">
              <table className="table">
                <thead><tr>
                  <th>{t('common.grade')}</th><th>{t('bo.cap.offered')}</th><th>{t('bo.cap.sections')}</th><th>{t('bo.cap.max')}</th><th className="num">{t('col.capacity')}</th>
                  <th className="num">{t('col.enrolled')}</th><th className="num">{t('col.held')}</th><th className="num">{t('col.offered')}</th><th className="num">{t('col.available')}</th><th>{t('col.utilisation')}</th><th />
                </tr></thead>
                <tbody>
                  {s.grades.map((g) => (
                    <GradeRow key={g.grade} g={g} ro={ro} threshold={lookups.settings.capacity_warning_threshold}
                      canForce={me.role === 'ministry_admin' && me.force_registration}
                      onSave={(v) => save(g, v)} onForce={() => setForce(g)} />
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ))}
      </Loader>
      {force && <ForceModal schoolId={school} ay={ay} grade={force} onClose={() => setForce(null)} onDone={() => { setForce(null); st.reload(); }} />}
    </>
  );
}
