// Session + shared lookup data (schools, lists, windows) for the whole app.
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, getToken, setToken } from './api.js';
import { useI18n } from './i18n.jsx';

const Ctx = createContext(null);

export function AuthProvider({ children }) {
  const [me, setMe] = useState(null);
  const [lookups, setLookups] = useState(null);
  const [loading, setLoading] = useState(true);
  const { L } = useI18n();

  const refresh = useCallback(async () => {
    if (!getToken()) { setMe(null); return null; }
    try {
      const m = await api.get('/auth/me');
      setMe(m);
      return m;
    } catch {
      setMe(null);
      return null;
    }
  }, []);
  const refreshLookups = useCallback(() => api.get('/lookups').then(setLookups), []);

  useEffect(() => {
    Promise.all([refresh(), refreshLookups()]).finally(() => setLoading(false));
    const out = () => setMe(null);
    window.addEventListener('moe:logout', out);
    return () => window.removeEventListener('moe:logout', out);
  }, []);

  const signIn = async (token) => {
    setToken(token);
    return refresh();
  };
  const signOut = async () => {
    try { await api.post('/auth/logout'); } catch { /* ignore */ }
    setToken(null);
    setMe(null);
  };

  // helpers over lookups
  const listOf = (type, parent) => (lookups?.lists || []).filter((x) => x.list_type === type && (parent === undefined || x.parent_code === parent));
  const label = (type, code) => {
    const it = (lookups?.lists || []).find((x) => x.list_type === type && x.code === code);
    return it ? L(it, 'label') : code || '—';
  };
  const school = (id) => (lookups?.schools || []).find((s) => s.id === Number(id));

  return <Ctx.Provider value={{ me, setMe, refresh, signIn, signOut, loading, lookups, refreshLookups, listOf, label, school }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
