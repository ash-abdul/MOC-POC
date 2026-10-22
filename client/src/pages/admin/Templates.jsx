// AD-05: bilingual templates for every notification in section 4.5.
import { useState, useEffect } from 'react';
import { api } from '../../api.js';
import { useI18n } from '../../i18n.jsx';
import { useAsync, useAction, PageHead, Loader, Card, Field } from '../../components/ui.jsx';
import { useReadOnly, ReadOnlyNote } from '../../components/AdminBits.jsx';

const placeholders = (tp) => [...new Set(`${tp.subject_en} ${tp.body_en}`.match(/\{\{\w+\}\}/g) || [])];

function TemplateEditor({ tp, ro, onSaved }) {
  const { t } = useI18n();
  const [v, setV] = useState(tp);
  const [run, busy] = useAction();
  useEffect(() => setV(tp), [tp]);
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });
  const dirty = ['subject_en', 'subject_ar', 'body_en', 'body_ar'].some((k) => v[k] !== tp[k]);
  return (
    <Card title={<><code>{tp.key}</code> <span className="small muted">{t(`bo.tpl.${tp.key}`, { default: '' })}</span></>}>
      <div className="row small mb">{t('bo.tpl.placeholders')}: {placeholders(tp).map((p) => <code key={p}>{p}</code>)}</div>
      <div className="grid c2">
        <div className="stack" dir="ltr">
          <Field label={t('bo.tpl.subject_en')}><input disabled={ro} value={v.subject_en} onChange={set('subject_en')} /></Field>
          <Field label={t('bo.tpl.body_en')}><textarea disabled={ro} rows={4} value={v.body_en} onChange={set('body_en')} /></Field>
        </div>
        <div className="stack" dir="rtl">
          <Field label={t('bo.tpl.subject_ar')}><input disabled={ro} value={v.subject_ar} onChange={set('subject_ar')} /></Field>
          <Field label={t('bo.tpl.body_ar')}><textarea disabled={ro} rows={4} value={v.body_ar} onChange={set('body_ar')} /></Field>
        </div>
      </div>
      {!ro && dirty && (
        <div className="row mt">
          <button className="btn sm" disabled={busy} onClick={() => run(() => api.put(`/admin/templates/${tp.key}`, v), t('common.saved')).then(onSaved).catch(() => {})}>{t('common.save')}</button>
          <button className="btn secondary sm" onClick={() => setV(tp)}>{t('common.reset')}</button>
        </div>
      )}
    </Card>
  );
}

export default function Templates() {
  const { t } = useI18n();
  const ro = useReadOnly();
  const st = useAsync(() => api.get('/admin/templates'), []);
  const [q, setQ] = useState('');
  return (
    <>
      <PageHead title={t('nav.templates')} sub={t('bo.tpl.sub')} reqs={['AD-05', '4.5', 'TR-07']}>
        <input style={{ width: 240 }} placeholder={t('common.search')} value={q} onChange={(e) => setQ(e.target.value)} />
      </PageHead>
      <ReadOnlyNote />
      <Loader state={st}>
        {(rows) => rows.filter((r) => !q || JSON.stringify(r).toLowerCase().includes(q.toLowerCase())).map((tp) => <TemplateEditor key={tp.key} tp={tp} ro={ro} onSaved={st.reload} />)}
      </Loader>
    </>
  );
}
