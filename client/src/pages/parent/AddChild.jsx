// Add a child / sibling (PP-04, PP-05, PP-06, PP-20). Identity data comes from the identity
// service (ICP mock); the eligible grade is calculated on save.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { useI18n } from '../../i18n.jsx';
import { useAuth } from '../../auth.jsx';
import { PageHead, Card, Field, Kv, useAction } from '../../components/ui.jsx';
import { EligibleText, PathwayModal, gradeLabel } from './shared.jsx';

const SCHOOLING = ['none', 'moe', 'private', 'other_emirate', 'abroad'];

export default function AddChild() {
  const { t, L, fmtDate } = useI18n();
  const { lookups, label } = useAuth();
  const [f, setF] = useState({ emiratesId: '', passportNo: '', schoolingStatus: 'none', lastCompletedGrade: '', sod: false });
  const [icp, setIcp] = useState(null);
  const [saved, setSaved] = useState(null);
  const [apply, setApply] = useState(false);
  const [run, busy] = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const validate = () => run(async () => {
    const r = await api.get(`/mock/icp/${encodeURIComponent(f.emiratesId.trim())}`);
    if (!r.valid) throw Object.assign(new Error(t('error.eid_invalid')), { code: 'eid_invalid' });
    setIcp(r);
  });
  const save = () => run(async () => {
    const r = await api.post('/family/children', { ...f, emiratesId: f.emiratesId.trim() });
    setSaved(r);
  }, t('parent.child.saved'));

  if (saved) {
    const c = saved.child;
    return (
      <>
        <PageHead title={t('parent.addchild.saved_title', { name: L(c, 'full_name') })} reqs={['PP-05', 'PP-06', 'PP-09']} />
        <Card>
          <div className="alert success mb"><div><b><EligibleText eligible={c.eligible} /></b><div className="small">{t('parent.addchild.rule_note')}</div></div></div>
          <Kv items={[
            [t('parent.addchild.sis'), saved.sis.enrolled ? t('parent.addchild.sis_yes', { school: L(saved.sis, 'school'), grade: gradeLabel(t, saved.sis.grade) }) : t('parent.addchild.sis_no')],
            [t('parent.child.siblings'), saved.siblings.length ? saved.siblings.map((s) => L(s, 'full_name')).join(', ') + ' — ' + t('parent.addchild.linked') : t('common.none')],
          ]} />
          <div className="row mt">
            {c.can_apply && <button className="btn" onClick={() => setApply(true)}>{t('parent.child.apply')}</button>}
            <Link className="btn secondary" to="/parent">{t('parent.addchild.to_family')}</Link>
          </div>
        </Card>
        {apply && <PathwayModal child={c} onClose={() => setApply(false)} />}
      </>
    );
  }

  return (
    <>
      <PageHead title={t('parent.addchild.title')} sub={t('parent.addchild.sub')} reqs={['PP-04', 'PP-20']} />
      <Card>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 260px' }}>
            <Field label={t('parent.addchild.eid')} required hint={t('parent.addchild.eid_hint')}>
              <input className="mono" value={f.emiratesId} onChange={(e) => { setIcp(null); set('emiratesId')(e); }} placeholder="784-YYYY-XXXXXXX-X" />
            </Field>
          </div>
          <button className="btn secondary" disabled={busy || !f.emiratesId} onClick={validate}>{t('parent.addchild.validate')}</button>
        </div>
        {icp && (
          <>
            <div className="alert success small mt">✔ {t('parent.addchild.validated')}</div>
            <h4 className="mt">{t('parent.addchild.identity')}</h4>
            <div className="form-grid">
              <Field label={t('parent.addchild.name')}><input disabled value={L(icp)} /></Field>
              <Field label={t('parent.addchild.dob')}><input disabled value={fmtDate(icp.dob)} /></Field>
              <Field label={t('common.gender')}><input disabled value={icp.gender === 'M' ? t('common.male') : t('common.female')} /></Field>
              <Field label={t('parent.addchild.nationality')}><input disabled value={label('nationality', icp.nationality)} /></Field>
            </div>
            <p className="hint">🔒 {t('parent.addchild.identity_locked')}</p>
            <h4 className="mt">{t('parent.addchild.schooling')}</h4>
            <div className="form-grid">
              {icp.nationality !== 'AE' && (
                <Field label={t('parent.addchild.passport')} required><input value={f.passportNo} onChange={set('passportNo')} /></Field>
              )}
              <Field label={t('parent.addchild.schooling_status')} required>
                <select value={f.schoolingStatus} onChange={set('schoolingStatus')}>
                  {SCHOOLING.map((s) => <option key={s} value={s}>{t(`parent.schooling.${s}`)}</option>)}
                </select>
              </Field>
              {f.schoolingStatus !== 'none' && (
                <Field label={t('parent.addchild.last_grade')} hint={t('parent.addchild.last_grade_hint')}>
                  <select value={f.lastCompletedGrade} onChange={set('lastCompletedGrade')}>
                    <option value="">—</option>
                    {lookups.grades.map((g) => <option key={g} value={g}>{t(`grade.${g}`)}</option>)}
                  </select>
                </Field>
              )}
            </div>
            <label className="check mt">
              <input type="checkbox" checked={f.sod} onChange={set('sod')} />
              <span>{t('parent.addchild.sod')}<span className="hint" style={{ display: 'block' }}>{t('parent.addchild.sod_hint')}</span></span>
            </label>
            <div className="row mt">
              <button className="btn" disabled={busy || (icp.nationality !== 'AE' && !f.passportNo)} onClick={save}>{t('parent.addchild.save')}</button>
              <Link className="btn secondary" to="/parent">{t('common.cancel')}</Link>
            </div>
          </>
        )}
      </Card>
    </>
  );
}
