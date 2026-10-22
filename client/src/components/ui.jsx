// Shared UI building blocks.
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n.jsx';

/* ---------- data loading ---------- */
export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const run = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await fn();
      setState({ loading: false, data, error: null });
      return data;
    } catch (error) {
      setState({ loading: false, data: null, error });
    }
  }, deps);
  useEffect(() => { run(); }, [run]);
  return { ...state, reload: run, setData: (d) => setState((s) => ({ ...s, data: typeof d === 'function' ? d(s.data) : d })) };
}

/* ---------- toasts ---------- */
const ToastCtx = createContext(() => {});
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((msg, kind = 'info') => {
    const id = Math.random();
    setItems((x) => [...x, { id, msg, kind }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), kind === 'error' ? 7000 : 4000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-wrap">{items.map((i) => <div key={i.id} className={`toast ${i.kind}`}>{i.msg}</div>)}</div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

// Run an async action with a busy flag and toast feedback. Returns [run, busy].
export function useAction() {
  const toast = useToast();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (fn, okMsg) => {
    setBusy(true);
    try {
      const r = await fn();
      if (okMsg) toast(okMsg, 'success');
      return r;
    } catch (e) {
      toast(t(`error.${e.code}`, { default: e.message }), 'error');
      throw e;
    } finally {
      setBusy(false);
    }
  }, [toast, t]);
  return [run, busy];
}

/* ---------- layout ---------- */
export function PageHead({ title, sub, children, reqs }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
        {reqs && <div className="row mt" style={{ marginTop: 6 }}>{reqs.map((r) => <ReqTag key={r} id={r} />)}</div>}
      </div>
      {children && <div className="row">{children}</div>}
    </div>
  );
}
// Requirement reference chip linking to the documentation page
export const ReqTag = ({ id }) => <Link to={`/docs#${id}`} className="req-tag" title="Requirement">{id}</Link>;

export function Card({ title, actions, children, className = '', ...rest }) {
  return (
    <section className={`card ${className}`} {...rest}>
      {(title || actions) && <div className="card-head">{title && <h3>{title}</h3>}{actions && <div className="row">{actions}</div>}</div>}
      {children}
    </section>
  );
}

export const Spinner = () => <div className="spinner" />;
export function Empty({ children }) {
  const { t } = useI18n();
  return <div className="empty">{children || t('common.no_data')}</div>;
}
export function ErrorBox({ error }) {
  const { t } = useI18n();
  if (!error) return null;
  return <div className="alert error">{t(`error.${error.code}`, { default: error.message })}</div>;
}
// Standard loading / error wrapper
export function Loader({ state, children }) {
  if (state.loading && !state.data) return <Spinner />;
  if (state.error) return <ErrorBox error={state.error} />;
  return children(state.data);
}

export function Modal({ title, onClose, children, footer, wide }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true">
        <div className="mh"><h3>{title}</h3><button className="btn ghost sm" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="mb">{children}</div>
        {footer && <div className="mf">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, required, hint, children }) {
  return (
    <label className="field">
      <span>{label}{required && <span className="req"> *</span>}</span>
      {children}
      {hint && <div className="hint">{hint}</div>}
    </label>
  );
}

export function Kv({ items }) {
  return <dl className="kv">{items.filter(Boolean).map(([k, v], i) => [<dt key={'k' + i}>{k}</dt>, <dd key={'v' + i}>{v ?? '—'}</dd>])}</dl>;
}

export function Stat({ label, value, sub, accent }) {
  return <div className={`stat ${accent ? 'accent' : ''}`}><div className="label">{label}</div><div className="value">{value}</div>{sub && <div className="sub">{sub}</div>}</div>;
}

export function Tabs({ tabs, value, onChange }) {
  return <div className="tabs" role="tablist">{tabs.map(([k, label]) => <button key={k} role="tab" className={value === k ? 'active' : ''} onClick={() => onChange(k)}>{label}</button>)}</div>;
}

/* ---------- status badges ---------- */
const STATUS_COLOR = {
  draft: '', submitted: 'blue', under_review: 'blue', info_requested: 'amber', passed: 'amber', escalated: 'amber',
  offer_made: 'gold', accepted: 'green', rejected: 'red', withdrawn: '', lapsed: 'red', closed: '',
  enrolled: 'green', pending_renewal: 'amber', leaving: 'amber', left: '', held: 'blue', confirmed: 'green', waitlisted: 'amber', released: '',
};
export function StatusBadge({ status }) {
  const { t } = useI18n();
  return <span className={`badge ${STATUS_COLOR[status] ?? ''}`}>{t(`status.${status}`)}</span>;
}
export function SlaBadge({ sla }) {
  const { t } = useI18n();
  if (!sla) return null;
  const c = { on_time: 'green', due_today: 'amber', overdue: 'red', paused: '' }[sla];
  return <span className={`badge ${c}`}>{t(`sla.${sla}`)}</span>;
}
export function SeatBadge({ status }) {
  const { t } = useI18n();
  if (!status) return null;
  const c = { available: 'green', limited: 'amber', full: 'red' }[status];
  return <span className={`badge ${c}`}>{t(`seat.${status}`)}</span>;
}

export function CapacityBar({ pct, threshold = 90 }) {
  const cls = pct >= 100 ? 'full' : pct >= threshold ? 'warn' : '';
  return <div className="bar-track" title={`${pct}%`}><div className={`bar-fill ${cls}`} style={{ width: `${Math.min(100, pct || 0)}%` }} /></div>;
}

/* ---------- generic table ----------
 * columns: [{ key, label, render?(row), num?, className? }] */
export function DataTable({ columns, rows, onRowClick, footer, empty, maxHeight }) {
  if (!rows?.length) return <Empty>{empty}</Empty>;
  return (
    <div className="table-wrap" style={maxHeight ? { maxHeight, overflowY: 'auto' } : undefined}>
      <table className="table">
        <thead><tr>{columns.map((c) => <th key={c.key} className={c.num ? 'num' : ''}>{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id ?? i} className={onRowClick ? 'clickable' : ''} onClick={onRowClick ? () => onRowClick(r) : undefined}>
              {columns.map((c) => <td key={c.key} className={`${c.num ? 'num' : ''} ${c.className || ''}`}>{c.render ? c.render(r) : r[c.key] ?? '—'}</td>)}
            </tr>
          ))}
        </tbody>
        {footer && <tfoot><tr>{columns.map((c, i) => <td key={c.key} className={c.num ? 'num' : ''}>{footer[c.key] ?? (i === 0 ? '' : '')}</td>)}</tr></tfoot>}
      </table>
    </div>
  );
}

/* ---------- file picker with client-side checks (PP-13) ---------- */
export function FilePick({ onFile, maxMb = 5, accept = '.pdf,.jpg,.jpeg,.png', capture }) {
  const { t } = useI18n();
  const toast = useToast();
  return (
    <input
      type="file"
      accept={accept}
      {...(capture ? { capture: 'environment' } : {})}
      onChange={(e) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (!f) return;
        if (f.size > maxMb * 1024 * 1024) return toast(t('error.file_too_large'), 'error');
        if (!/\.(pdf|jpe?g|png)$/i.test(f.name)) return toast(t('error.file_type'), 'error');
        onFile(f);
      }}
    />
  );
}
