// TR-07: English / Arabic texts come from resource files; administrators override any string here.
import { useState, useMemo } from 'react';
import { api } from '../../api.js';
import { useI18n } from '../../i18n.jsx';
import { useAsync, useAction, PageHead, Loader, Card } from '../../components/ui.jsx';
import { useReadOnly, ReadOnlyNote } from '../../components/AdminBits.jsx';

function Row({ k, en, ar, overrides, ro, onSaved }) {
  const { t } = useI18n();
  const [v, setV] = useState({ en, ar });
  const [run, busy] = useAction();
  const save = (lang) => run(() => api.put('/admin/translations', { key: k, lang, value: v[lang] }), t('common.saved')).then(onSaved).catch(() => {});
  const reset = (lang) => run(() => api.put('/admin/translations', { key: k, lang, value: null }), t('common.saved')).then(onSaved).catch(() => {});
  return (
    <tr>
      <td className="mono small" style={{ maxWidth: 220, wordBreak: 'break-all' }}>{k}</td>
      {['en', 'ar'].map((lang) => (
        <td key={lang} style={{ minWidth: 260 }}>
          <textarea rows={1} dir={lang === 'ar' ? 'rtl' : 'ltr'} disabled={ro} value={v[lang] ?? ''} onChange={(e) => setV({ ...v, [lang]: e.target.value })} />
          <div className="row" style={{ gap: 4 }}>
            {overrides[lang] !== undefined && <span className="badge gold">{t('bo.tr8.overridden')}</span>}
            {!ro && v[lang] !== (lang === 'en' ? en : ar) && <button className="btn sm" disabled={busy} onClick={() => save(lang)}>{t('common.save')}</button>}
            {!ro && overrides[lang] !== undefined && <button className="btn ghost sm" disabled={busy} onClick={() => reset(lang)}>{t('bo.tr8.reset')}</button>}
          </div>
        </td>
      ))}
    </tr>
  );
}

export default function Translations() {
  const { t, reload } = useI18n();
  const ro = useReadOnly();
  const st = useAsync(async () => {
    const [en, ar, ov] = await Promise.all([api.get('/lookups/i18n/en'), api.get('/lookups/i18n/ar'), api.get('/admin/translations')]);
    return { en, ar, ov };
  }, []);
  const [q, setQ] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [page, setPage] = useState(0);
  const rows = useMemo(() => {
    if (!st.data) return [];
    const keys = [...new Set([...Object.keys(st.data.en), ...Object.keys(st.data.ar)])].sort();
    const s = q.toLowerCase();
    return keys.filter((k) => (!s || k.toLowerCase().includes(s) || String(st.data.en[k] || '').toLowerCase().includes(s) || String(st.data.ar[k] || '').includes(q))
      && (!onlyMissing || !st.data.ar[k] || !st.data.en[k]));
  }, [st.data, q, onlyMissing]);
  const PER = 50;
  const ovFor = (k) => Object.fromEntries((st.data?.ov || []).filter((o) => o.key === k).map((o) => [o.lang, o.value]));
  return (
    <>
      <PageHead title={t('nav.translations')} sub={t('bo.tr8.sub')} reqs={['TR-07', 'A15']}>
        <input style={{ width: 260 }} placeholder={t('common.search')} value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
        <label className="check small"><input type="checkbox" checked={onlyMissing} onChange={(e) => { setOnlyMissing(e.target.checked); setPage(0); }} />{t('bo.tr8.missing')}</label>
      </PageHead>
      <ReadOnlyNote />
      <Loader state={st}>
        {(d) => (
          <Card>
            <p className="small muted">{t('bo.tr8.count', { n: rows.length })}</p>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>{t('bo.tr8.key')}</th><th>English</th><th>العربية</th></tr></thead>
                <tbody>{rows.slice(page * PER, page * PER + PER).map((k) => <Row key={`${k}-${d.en[k]}-${d.ar[k]}`} k={k} en={d.en[k]} ar={d.ar[k]} overrides={ovFor(k)} ro={ro} onSaved={() => { st.reload(); reload(); }} />)}</tbody>
              </table>
            </div>
            <div className="row mt">
              <button className="btn secondary sm" disabled={page === 0} onClick={() => setPage(page - 1)}>‹</button>
              <span className="small">{page + 1} / {Math.max(1, Math.ceil(rows.length / PER))}</span>
              <button className="btn secondary sm" disabled={(page + 1) * PER >= rows.length} onClick={() => setPage(page + 1)}>›</button>
            </div>
          </Card>
        )}
      </Loader>
    </>
  );
}
