// AD-06: assign roles, schools and the force-registration permission to named users.
import { useState } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { useI18n } from '../../i18n.jsx';
import { useAsync, useAction, PageHead, Loader, Card, Modal, Field, ReqTag } from '../../components/ui.jsx';
import { useReadOnly, ReadOnlyNote } from '../../components/AdminBits.jsx';

const ROLES = ['registrar', 'principal', 'cluster_officer', 'ministry_admin', 'ministry_viewer', 'transport'];

function UserRow({ u, ro, onSaved }) {
  const { t, L } = useI18n();
  const { lookups, me } = useAuth();
  const [v, setV] = useState({ role: u.role, school_id: u.school_id || '', force_registration: !!u.force_registration, active: !!u.active });
  const [run, busy] = useAction();
  const dirty = v.role !== u.role || String(v.school_id || '') !== String(u.school_id || '') || v.force_registration !== !!u.force_registration || v.active !== !!u.active;
  const needsSchool = ['registrar', 'principal'].includes(v.role);
  return (
    <tr style={{ opacity: v.active ? 1 : 0.5 }}>
      <td>{L(u)}<div className="small muted">{u.email}</div></td>
      <td><select disabled={ro || u.id === me.id} value={v.role} onChange={(e) => setV({ ...v, role: e.target.value })}>{ROLES.map((r) => <option key={r} value={r}>{t(`role.${r}`)}</option>)}</select></td>
      <td>{needsSchool ? <select disabled={ro} value={v.school_id} onChange={(e) => setV({ ...v, school_id: e.target.value })}><option value="" />{lookups.schools.map((s) => <option key={s.id} value={s.id}>{s.code} · {L(s)}</option>)}</select> : <span className="muted small">—</span>}</td>
      <td>{v.role === 'ministry_admin' ? <label className="check"><input type="checkbox" disabled={ro} checked={v.force_registration} onChange={(e) => setV({ ...v, force_registration: e.target.checked })} />{v.force_registration && <span className="badge dark">{t('role.force')}</span>}</label> : <span className="muted small">—</span>}</td>
      <td><input type="checkbox" disabled={ro || u.id === me.id} checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} /></td>
      <td>{!ro && dirty && <button className="btn sm" disabled={busy || (needsSchool && !v.school_id)} onClick={() => run(() => api.put(`/admin/users/${u.id}`, v), t('common.saved')).then(onSaved).catch(() => {})}>{t('common.save')}</button>}</td>
    </tr>
  );
}

export default function Users() {
  const { t, L } = useI18n();
  const { lookups } = useAuth();
  const ro = useReadOnly();
  const st = useAsync(() => api.get('/admin/users'), []);
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [adding, setAdding] = useState(null);
  const [run, busy] = useAction();
  return (
    <>
      <PageHead title={t('nav.users')} sub={t('bo.users.sub')} reqs={['AD-06', 'CC-06', 'TR-02']}>
        <select style={{ width: 'auto' }} value={role} onChange={(e) => setRole(e.target.value)}><option value="">{t('common.all')}</option>{ROLES.map((r) => <option key={r} value={r}>{t(`role.${r}`)}</option>)}</select>
        <input style={{ width: 200 }} placeholder={t('common.search')} value={q} onChange={(e) => setQ(e.target.value)} />
        {!ro && <button className="btn" onClick={() => setAdding({ name_en: '', name_ar: '', email: '', role: 'registrar', school_id: '', force_registration: false })}>+ {t('bo.users.add')}</button>}
      </PageHead>
      <ReadOnlyNote />
      <div className="alert gold small mb">{t('bo.users.force_note')} <ReqTag id="CC-06" /> <ReqTag id="A7" /></div>
      <Loader state={st}>
        {(rows) => (
          <Card>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>{t('bo.f.name')}</th><th>{t('col.role')}</th><th>{t('common.school')}</th><th>{t('role.force')}</th><th>{t('bo.users.active')}</th><th /></tr></thead>
                <tbody>
                  {rows.filter((u) => (!role || u.role === role) && (!q || `${u.name_en} ${u.name_ar} ${u.email} ${u.school_en}`.toLowerCase().includes(q.toLowerCase())))
                    .map((u) => <UserRow key={`${u.id}-${u.role}-${u.school_id}-${u.force_registration}-${u.active}`} u={u} ro={ro} onSaved={st.reload} />)}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </Loader>
      {adding && (
        <Modal title={t('bo.users.add')} onClose={() => setAdding(null)} footer={<button className="btn" disabled={busy || !adding.name_en || (['registrar', 'principal'].includes(adding.role) && !adding.school_id)} onClick={() => run(() => api.post('/admin/users', { ...adding, school_id: adding.school_id ? Number(adding.school_id) : null }), t('common.saved')).then(() => { setAdding(null); st.reload(); }).catch(() => {})}>{t('common.add')}</button>}>
          <div className="form-grid">
            <Field label={t('bo.lists.label_en')} required><input value={adding.name_en} onChange={(e) => setAdding({ ...adding, name_en: e.target.value })} /></Field>
            <Field label={t('bo.lists.label_ar')}><input dir="rtl" value={adding.name_ar} onChange={(e) => setAdding({ ...adding, name_ar: e.target.value })} /></Field>
            <Field label={t('uaepass.claim_email')}><input type="email" value={adding.email} onChange={(e) => setAdding({ ...adding, email: e.target.value })} /></Field>
            <Field label={t('col.role')}><select value={adding.role} onChange={(e) => setAdding({ ...adding, role: e.target.value })}>{ROLES.map((r) => <option key={r} value={r}>{t(`role.${r}`)}</option>)}</select></Field>
            {['registrar', 'principal'].includes(adding.role) && <Field label={t('common.school')} required><select value={adding.school_id} onChange={(e) => setAdding({ ...adding, school_id: e.target.value })}><option value="" />{lookups.schools.map((s) => <option key={s.id} value={s.id}>{L(s)}</option>)}</select></Field>}
            {adding.role === 'ministry_admin' && <label className="check"><input type="checkbox" checked={adding.force_registration} onChange={(e) => setAdding({ ...adding, force_registration: e.target.checked })} />{t('role.force')}</label>}
          </div>
        </Modal>
      )}
    </>
  );
}
