// AD-03: document types, rejection reasons, leaving reasons / sub-reasons, information-request and exceptional reasons.
import { useState } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { useI18n } from '../../i18n.jsx';
import { useAsync, useAction, PageHead, Loader, Card, Tabs, Modal, Field } from '../../components/ui.jsx';
import { useReadOnly, ReadOnlyNote } from '../../components/AdminBits.jsx';

const TYPES = ['doc_type', 'reject_reason', 'leave_reason', 'leave_subreason', 'info_reason', 'exceptional_reason', 'nationality'];
const PATHS = ['new', 'private', 'other_emirate', 'abroad', 'renewal', 'renewal_moved'];

function ItemRow({ it, ro, onSaved, parentLabel }) {
  const { t } = useI18n();
  const [v, setV] = useState({ label_en: it.label_en, label_ar: it.label_ar });
  const [run, busy] = useAction();
  const save = (patch) => run(() => api.put(`/admin/lists/${it.id}`, patch), t('common.saved')).then(onSaved).catch(() => {});
  const dirty = v.label_en !== it.label_en || v.label_ar !== it.label_ar;
  return (
    <tr style={{ opacity: it.active ? 1 : 0.5 }}>
      <td><code>{it.code}</code></td>
      {parentLabel !== undefined && <td className="small">{parentLabel}</td>}
      <td><input disabled={ro} value={v.label_en} onChange={(e) => setV({ ...v, label_en: e.target.value })} /></td>
      <td><input disabled={ro} dir="rtl" value={v.label_ar} onChange={(e) => setV({ ...v, label_ar: e.target.value })} /></td>
      <td>{it.active ? <span className="badge green">{t('bo.lists.active')}</span> : <span className="badge">{t('bo.lists.inactive')}</span>}</td>
      <td className="nowrap">
        {!ro && dirty && <button className="btn sm" disabled={busy} onClick={() => save(v)}>{t('common.save')}</button>}
        {!ro && <button className="btn ghost sm" disabled={busy} onClick={() => save({ active: !it.active })}>{it.active ? t('bo.lists.deactivate') : t('bo.lists.activate')}</button>}
      </td>
    </tr>
  );
}

function AddModal({ type, parents, onClose, onDone }) {
  const { t, L } = useI18n();
  const [f, setF] = useState({ code: '', label_en: '', label_ar: '', parent_code: '', matrix: Object.fromEntries(PATHS.map((p) => [p, 'R'])) });
  const [run, busy] = useAction();
  const ok = /^[a-z0-9_]+$/.test(f.code) && f.label_en && f.label_ar && (type !== 'leave_subreason' || f.parent_code);
  return (
    <Modal title={`${t('common.add')} – ${t(`bo.lists.t.${type}`)}`} onClose={onClose} wide footer={<button className="btn" disabled={!ok || busy} onClick={() => run(() => api.post('/admin/lists', { list_type: type, ...f, matrix: type === 'doc_type' ? f.matrix : undefined }), t('common.saved')).then(onDone).catch(() => {})}>{t('common.add')}</button>}>
      <div className="form-grid">
        <Field label={t('bo.lists.code')} required hint={t('bo.lists.code_hint')}><input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.trim() })} /></Field>
        {type === 'leave_subreason' && <Field label={t('bo.lists.parent')} required><select value={f.parent_code} onChange={(e) => setF({ ...f, parent_code: e.target.value })}><option value="" />{parents.map((p) => <option key={p.code} value={p.code}>{L(p, 'label')}</option>)}</select></Field>}
        <Field label={t('bo.lists.label_en')} required><input value={f.label_en} onChange={(e) => setF({ ...f, label_en: e.target.value })} /></Field>
        <Field label={t('bo.lists.label_ar')} required><input dir="rtl" value={f.label_ar} onChange={(e) => setF({ ...f, label_ar: e.target.value })} /></Field>
      </div>
      {type === 'doc_type' && (
        <>
          <h4 className="mt">{t('bo.lists.matrix')}</h4>
          <div className="row">
            {PATHS.map((p) => (
              <label key={p} className="field" style={{ width: 130 }}><span>{t(`bo.rules.path.${p}`)}</span>
                <select value={f.matrix[p]} onChange={(e) => setF({ ...f, matrix: { ...f.matrix, [p]: e.target.value } })}>{['R', 'C', 'E', 'M', '-'].map((r) => <option key={r} value={r}>{r} – {t(`docreq.${r}`)}</option>)}</select>
              </label>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}

export default function Lists() {
  const { t, L } = useI18n();
  const { refreshLookups } = useAuth();
  const ro = useReadOnly();
  const [type, setType] = useState('doc_type');
  const [adding, setAdding] = useState(false);
  const st = useAsync(() => api.get('/admin/lists'), []);
  const reload = () => { st.reload(); refreshLookups(); };
  return (
    <>
      <PageHead title={t('nav.lists')} sub={t('bo.lists.sub')} reqs={['AD-03', 'BR-13', 'TR-03']}>
        {!ro && <button className="btn" onClick={() => setAdding(true)}>+ {t('common.add')}</button>}
      </PageHead>
      <ReadOnlyNote />
      <Tabs tabs={TYPES.map((x) => [x, t(`bo.lists.t.${x}`)])} value={type} onChange={setType} />
      <Loader state={st}>
        {(rows) => {
          const items = rows.filter((r) => r.list_type === type);
          const parents = rows.filter((r) => r.list_type === 'leave_reason');
          const isSub = type === 'leave_subreason';
          return (
            <Card>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>{t('bo.lists.code')}</th>{isSub && <th>{t('bo.lists.parent')}</th>}<th>{t('bo.lists.label_en')}</th><th>{t('bo.lists.label_ar')}</th><th>{t('common.status')}</th><th /></tr></thead>
                  <tbody>{items.map((it) => <ItemRow key={`${it.id}-${it.label_en}-${it.label_ar}-${it.active}`} it={it} ro={ro} onSaved={reload} parentLabel={isSub ? L(parents.find((p) => p.code === it.parent_code), 'label') : undefined} />)}</tbody>
                </table>
              </div>
              {type === 'doc_type' && <p className="small muted mt">{t('bo.lists.doc_hint')}</p>}
            </Card>
          );
        }}
      </Loader>
      {adding && <AddModal type={type} parents={(st.data || []).filter((r) => r.list_type === 'leave_reason')} onClose={() => setAdding(false)} onDone={() => { setAdding(false); reload(); }} />}
    </>
  );
}
