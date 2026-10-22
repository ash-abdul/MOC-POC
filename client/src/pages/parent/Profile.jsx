// Family profile (PP-01, PP-02, PP-03): guardians, emergency contact, custody, second guardian.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { useI18n } from '../../i18n.jsx';
import { useAuth } from '../../auth.jsx';
import { useAsync, Loader, PageHead, Card, Field, Kv, Modal, FilePick, useAction, ReqTag } from '../../components/ui.jsx';

const RELATIONSHIPS = ['father', 'mother', 'guardian'];
const CHANNELS = ['email', 'sms', 'inapp'];

export default function Profile() {
  const { t, L, fmtDate } = useI18n();
  const { label } = useAuth();
  const st = useAsync(() => api.get('/family'), []);
  const [edit, setEdit] = useState(null);
  return (
    <>
      <PageHead title={t('nav.profile')} sub={t('parent.profile.sub')} reqs={['PP-01', 'PP-02', 'PP-03']} />
      <Loader state={st}>
        {(d) => (
          <>
            <div className="grid c2">
              {d.guardians.filter((g) => g.status === 'active').map((g) => (
                <Card key={g.id} title={L(g, 'full_name')} actions={<button className="btn secondary sm" onClick={() => setEdit(g)}>{t('common.edit')}</button>}>
                  <div className="row small mb" style={{ marginBottom: 8 }}>
                    {g.is_primary ? <span className="badge gold">{t('parent.family.primary')}</span> : <span className="badge green">{t('parent.family.linked')}</span>}
                    {g.id === d.me.guardianId && <span className="badge">{t('parent.profile.you')}</span>}
                  </div>
                  <Kv items={[
                    [<>🔒 {t('parent.profile.eid')}</>, <span className="mono">{g.emirates_id}</span>],
                    [<>🔒 {t('parent.profile.name_ar')}</>, g.full_name_ar],
                    [<>🔒 {t('parent.profile.mobile')}</>, g.mobile],
                    [<>🔒 {t('parent.profile.email')}</>, g.email],
                    [t('parent.profile.eid_expiry'), fmtDate(g.eid_expiry)],
                    [t('parent.addchild.nationality'), label('nationality', g.nationality)],
                    [t('parent.profile.relationship'), t(`relationship.${g.relationship || 'guardian'}`)],
                    [t('parent.profile.channel'), t(`channel.${g.preferred_channel || 'email'}`)],
                  ]} />
                  <p className="hint mt">🔒 {t('parent.profile.locked')}</p>
                </Card>
              ))}
              <SecondGuardian d={d} reload={st.reload} />
            </div>
            <div className="grid c2 mt">
              <Emergency d={d} reload={st.reload} />
              <Card title={t('parent.family.home')} actions={<Link className="btn secondary sm" to="/parent/home-location">{t('parent.family.change_home')}</Link>}>
                {d.family.residence_confirmed ? (
                  <Kv items={[[t('common.emirate'), d.family.emirate], [t('parent.home.area'), L(d.family, 'area')], [t('parent.home.makani'), <span className="mono">{d.family.makani}</span>]]} />
                ) : <p className="small muted">{t('parent.family.no_home_short')}</p>}
                <p className="small muted mt">{t('parent.profile.home_note')} <ReqTag id="PP-08" /></p>
              </Card>
            </div>
          </>
        )}
      </Loader>
      {edit && <EditGuardian g={edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); st.reload(); }} />}
    </>
  );
}

function EditGuardian({ g, onClose, onDone }) {
  const { t, L } = useI18n();
  const { listOf } = useAuth();
  const [f, setF] = useState({ nationality: g.nationality || 'AE', eid_expiry: g.eid_expiry || '', relationship: g.relationship || 'guardian', preferred_channel: g.preferred_channel || 'email' });
  const [run, busy] = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal title={L(g, 'full_name')} onClose={onClose} footer={<><button className="btn secondary" onClick={onClose}>{t('common.cancel')}</button><button className="btn" disabled={busy} onClick={() => run(async () => { await api.put(`/family/guardians/${g.id}`, f); onDone(); }, t('common.saved'))}>{t('common.save')}</button></>}>
      <div className="form-grid">
        <Field label={t('parent.addchild.nationality')}><select value={f.nationality} onChange={set('nationality')}>{listOf('nationality').map((n) => <option key={n.code} value={n.code}>{L(n, 'label')}</option>)}</select></Field>
        <Field label={t('parent.profile.eid_expiry')}><input type="date" value={f.eid_expiry} onChange={set('eid_expiry')} /></Field>
        <Field label={t('parent.profile.relationship')}><select value={f.relationship} onChange={set('relationship')}>{RELATIONSHIPS.map((r) => <option key={r} value={r}>{t(`relationship.${r}`)}</option>)}</select></Field>
        <Field label={t('parent.profile.channel')}><select value={f.preferred_channel} onChange={set('preferred_channel')}>{CHANNELS.map((c) => <option key={c} value={c}>{t(`channel.${c}`)}</option>)}</select></Field>
      </div>
      <p className="hint mt">🔒 {t('parent.profile.locked')}</p>
    </Modal>
  );
}

// PP-02: add the other parent by Emirates ID (pending until they confirm with UAE PASS)
function SecondGuardian({ d, reload }) {
  const { t } = useI18n();
  const [eid, setEid] = useState('');
  const [rel, setRel] = useState('mother');
  const [run, busy] = useAction();
  const pending = d.guardians.filter((g) => g.status === 'pending');
  const hasSecond = d.guardians.filter((g) => g.status === 'active').length > 1;
  if (hasSecond && !pending.length) return null;
  return (
    <Card title={t('parent.profile.second_title')}>
      {pending.map((g) => (
        <div key={g.id} className="alert warn small mb" style={{ alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <b className="mono">{g.emirates_id}</b> · {t(`relationship.${g.relationship || 'guardian'}`)}
            <div>{t('parent.profile.pending_text')}</div>
          </div>
          {d.me.isPrimary && <button className="btn secondary sm" disabled={busy} onClick={() => run(async () => { await api.del(`/family/guardians/${g.id}`); reload(); })}>{t('common.cancel')}</button>}
        </div>
      ))}
      {!pending.length && (d.me.isPrimary ? (
        d.family.sole_custody ? <p className="small muted">{t('parent.profile.sole_no_second')}</p> : (
          <>
            <p className="small muted">{t('parent.profile.second_text')}</p>
            <div className="form-grid">
              <Field label={t('parent.profile.eid')} required><input className="mono" value={eid} onChange={(e) => setEid(e.target.value)} placeholder="784-XXXX-XXXXXXX-X" /></Field>
              <Field label={t('parent.profile.relationship')}><select value={rel} onChange={(e) => setRel(e.target.value)}>{RELATIONSHIPS.map((r) => <option key={r} value={r}>{t(`relationship.${r}`)}</option>)}</select></Field>
            </div>
            <button className="btn mt" disabled={!eid || busy} onClick={() => run(async () => { await api.post('/family/guardians', { emiratesId: eid.trim(), relationship: rel }); setEid(''); reload(); }, t('parent.profile.invited'))}>{t('parent.profile.add_second')}</button>
          </>
        )
      ) : <p className="small muted">{t('parent.profile.primary_only')}</p>)}
      <p className="small muted mt">{t('parent.profile.second_rights')}</p>
    </Card>
  );
}

function Emergency({ d, reload }) {
  const { t } = useI18n();
  const fam = d.family;
  const [f, setF] = useState({ emergency_name: fam.emergency_name || '', emergency_relationship: fam.emergency_relationship || '', emergency_mobile: fam.emergency_mobile || '', sole_custody: !!fam.sole_custody });
  useEffect(() => setF({ emergency_name: fam.emergency_name || '', emergency_relationship: fam.emergency_relationship || '', emergency_mobile: fam.emergency_mobile || '', sole_custody: !!fam.sole_custody }), [fam]);
  const [run, busy] = useAction();
  const custody = d.documents.find((x) => x.doc_type === 'custody_order' && x.status !== 'rejected');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const upload = (file) => run(async () => { await api.upload('/family/documents', { doc_type: 'custody_order' }, file); reload(); }, t('parent.docs.upload_ok'));
  return (
    <Card title={t('parent.profile.emergency_title')}>
      <div className="form-grid">
        <Field label={t('parent.profile.em_name')} required><input value={f.emergency_name} onChange={set('emergency_name')} /></Field>
        <Field label={t('parent.profile.relationship')} required><input value={f.emergency_relationship} onChange={set('emergency_relationship')} /></Field>
        <Field label={t('parent.profile.mobile')} required><input value={f.emergency_mobile} onChange={set('emergency_mobile')} placeholder="+9715XXXXXXXX" /></Field>
      </div>
      <h4 className="mt">{t('parent.profile.custody_title')} <ReqTag id="PP-02" /></h4>
      <label className="check small"><input type="checkbox" checked={f.sole_custody} onChange={set('sole_custody')} /><span>{t('parent.profile.sole_custody')}</span></label>
      {f.sole_custody && (
        <div className="small mt">
          {custody ? <span className="badge green">✓ {t('parent.profile.custody_uploaded')}</span> : <span className="badge amber">{t('parent.profile.custody_needed')}</span>}
          <div className="mt" style={{ marginTop: 6 }}><FilePick onFile={upload} /></div>
        </div>
      )}
      <button className="btn mt" disabled={busy || !f.emergency_name || !f.emergency_mobile} onClick={() => run(async () => { await api.put('/family/details', f); reload(); }, t('common.saved'))}>{t('common.save')}</button>
    </Card>
  );
}
