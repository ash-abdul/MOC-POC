// Language context (TR-07). Strings come from the server resource files (+ admin overrides);
// switching language flips the whole layout to right-to-left.
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from './api.js';

const Ctx = createContext(null);

export function I18nProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem('moe_lang') || 'en');
  const [dicts, setDicts] = useState({});

  const load = useCallback(async (l, force) => {
    if (dicts[l] && !force) return;
    const d = await api.get(`/lookups/i18n/${l}`);
    setDicts((x) => ({ ...x, [l]: d }));
  }, [dicts]);

  useEffect(() => {
    // both languages are preloaded so switching never unmounts the page (forms keep their state)
    load('en');
    load('ar');
    localStorage.setItem('moe_lang', lang);
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

  const t = useCallback((key, vars) => {
    let s = dicts[lang]?.[key] ?? dicts.en?.[key];
    if (s === undefined) return vars?.default ?? key;
    if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
    return s;
  }, [dicts, lang]);

  // pick the localised column of a row: L(school, 'name') → name_en / name_ar
  const L = useCallback((row, field = 'name') => (row ? row[`${field}_${lang}`] ?? row[`${field}_en`] ?? row[field] ?? '' : ''), [lang]);

  const locale = lang === 'ar' ? 'ar-AE-u-nu-latn' : 'en-GB';
  const fmtDate = (d) => (d ? new Date(d.length === 10 ? d + 'T00:00:00' : d).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
  const fmtDateTime = (d) => (d ? new Date(d).toLocaleString(locale, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
  const fmtNum = (n, digits = 0) => (n === null || n === undefined || n === '' ? '—' : Number(n).toLocaleString(locale, { maximumFractionDigits: digits }));
  // label for a coded value from a list ('doc_type', code) or from i18n ('status.' + code)
  const ready = !!dicts.en && !!dicts.ar;

  return (
    <Ctx.Provider value={{ lang, setLang, t, L, fmtDate, fmtDateTime, fmtNum, ready, dir: lang === 'ar' ? 'rtl' : 'ltr', reload: () => load(lang, true) }}>
      {children}
    </Ctx.Provider>
  );
}

export const useI18n = () => useContext(Ctx);
