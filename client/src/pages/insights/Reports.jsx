// Insights and reports IR-01 .. IR-10 (section 4.4): filters in the URL, live results, chart and Excel export.
import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, qs, download } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { useI18n } from '../../i18n.jsx';
import { useAsync, PageHead, Card, Loader, DataTable, Field, ReqTag, useAction } from '../../components/ui.jsx';
import Bars from '../../components/Bars.jsx';
import { makeCell, isNum } from '../../components/reportFormat.js';

export const REPORT_IDS = ['IR-01', 'IR-02', 'IR-03', 'IR-04', 'IR-05', 'IR-06', 'IR-07', 'IR-08', 'IR-09', 'IR-10'];
const ALL_FILTERS = ['dates', 'ay', 'emirate', 'cluster', 'school', 'cycle', 'grade', 'section', 'gender'];
// Which filters make sense for each report (the API ignores the others)
const APPLIES = {
  'IR-01': ALL_FILTERS, 'IR-02': ALL_FILTERS, 'IR-09': ALL_FILTERS, 'IR-07': ALL_FILTERS, 'IR-08': ALL_FILTERS,
  'IR-03': ALL_FILTERS.filter((f) => f !== 'ay'),
  'IR-04': ['ay', 'emirate', 'cluster', 'school', 'cycle', 'grade', 'section'],
  'IR-05': ['dates', 'ay', 'emirate', 'cluster', 'school', 'cycle', 'grade'],
  'IR-06': ['dates', 'ay', 'emirate', 'cluster', 'school', 'cycle', 'grade', 'gender'],
  'IR-10': ['ay', 'emirate', 'cluster', 'school'],
};
// Report-specific option: [param, i18n prefix, options, default]
const EXTRA = {
  'IR-01': ['period', 'ins.period.', ['day', 'week', 'month'], 'month'],
  'IR-03': ['by', 'ins.by.', ['cycle', 'grade', 'section'], 'grade'],
  'IR-04': ['by', 'ins.by.', ['school', 'grade', 'section'], 'grade'],
  'IR-05': ['by', 'ins.alerts.', ['open', 'all'], 'open'],
  'IR-07': ['by', 'ins.by.', ['subreason', 'reason', 'cycle', 'grade', 'school'], 'subreason'],
  'IR-08': ['by', 'ins.by.', ['school', 'cycle', 'grade'], 'school'],
};

export function defaultRange(today, id, currentAy) {
  const y = Number(today.slice(0, 4)) - (today.slice(5) < '09-01' ? 1 : 0);
  // leavers are counted from the start of the school year (late August)
  const from = id === 'IR-07' && currentAy?.start_date ? currentAy.start_date : `${y}-09-01`;
  return { from, to: today };
}

export default function Reports() {
  const { id = 'IR-01' } = useParams();
  const [params, setParams] = useSearchParams();
  const { t, L, lang, fmtDateTime, fmtDate, fmtNum } = useI18n();
  const { me, lookups } = useAuth();
  const [run, busy] = useAction();
  const applies = APPLIES[id];
  const extra = EXTRA[id];
  const def = defaultRange(lookups.today, id, lookups.current_ay);

  // effective filters: URL values, falling back to defaults
  const filters = useMemo(() => {
    const f = {};
    for (const k of ['ay', 'emirate', 'cluster', 'school', 'cycle', 'grade', 'section', 'gender']) if (applies.includes(k) && params.get(k)) f[k] = params.get(k);
    if (applies.includes('dates')) { f.from = params.get('from') || def.from; f.to = params.get('to') || def.to; }
    if (extra) f[extra[0]] = params.get(extra[0]) || extra[3];
    return f;
  }, [params, id, lookups.today]);

  const [draft, setDraft] = useState(null);
  const form = draft || filters;
  const set = (k, v) => setDraft({ ...form, [k]: v });
  const apply = () => { setParams(Object.fromEntries(Object.entries(form).filter(([, v]) => v))); setDraft(null); };
  const reset = () => { setParams({}); setDraft(null); };

  const st = useAsync(() => api.get(`/reports/${id}${qs(filters)}`), [id, JSON.stringify(filters)]);
  const cell = makeCell({ t, lang, fmtNum, fmtDate, fmtDateTime });

  const exportXlsx = () => run(() => download(`/reports/${id}/export${qs({ ...filters, lang })}`, `${id}-${lang}.xlsx`), t('ins.exported'));

  const schoolLocked = ['registrar', 'principal'].includes(me.role);
  const clusterLocked = me.role === 'cluster_officer';
  const scope = schoolLocked ? t('ins.scope_school', { school: L(me.school) }) : clusterLocked ? t('ins.scope_cluster', { cluster: L(me.cluster) }) : t('ins.scope_all');
  const schools = (lookups.schools || []).filter((s) => !form.cluster || s.cluster_id === Number(form.cluster));
  const grades = form.cycle ? lookups.cycles[form.cycle] : lookups.grades;
  const notApplicable = ALL_FILTERS.filter((f) => !applies.includes(f)).map((f) => t(f === 'dates' ? 'ins.f.from' : `ins.f.${f}`) + (f === 'dates' ? ` / ${t('ins.f.to')}` : ''));

  const sel = (k, opts, { locked, any = true } = {}) => (
    <Field label={t(`ins.f.${k}`)}>
      <select value={form[k] || ''} disabled={locked} onChange={(e) => set(k, e.target.value)}>
        {any && <option value="">{k === 'ay' ? t('ins.f.default_ay') : t('ins.f.any')}</option>}
        {opts.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
      </select>
    </Field>
  );

  return (
    <>
      <PageHead title={t('ins.reports_title')} sub={t('ins.reports_sub')} reqs={['4.4', 'A12', 'TR-04']} />
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 250px) minmax(0, 1fr)', gap: 16 }} className="reports-grid">
        <style>{`@media (max-width: 900px) { .reports-grid { grid-template-columns: 1fr !important; } }`}</style>
        <nav className="card" style={{ padding: 8, alignSelf: 'start' }}>
          {REPORT_IDS.map((rid) => (
            <Link key={rid} to={`/insights/reports/${rid}`}
              style={{ display: 'block', padding: '8px 10px', borderRadius: 8, color: 'inherit', background: rid === id ? 'var(--gold-100)' : undefined, textDecoration: 'none' }}>
              <div className="row" style={{ gap: 6 }}><span className="req-tag">{rid}</span><b className="small">{t(`report.${rid}`)}</b></div>
              <div className="small muted" style={{ fontSize: '.75rem', marginTop: 2 }}>{t(`ins.desc.${rid}`)}</div>
            </Link>
          ))}
        </nav>

        <div style={{ minWidth: 0 }}>
          <Card>
            <div className="card-head">
              <div>
                <h2 style={{ margin: 0 }}><span className="muted" style={{ fontWeight: 400 }}>{id}</span> {t(`report.${id}`)}</h2>
                <div className="small muted">{t(`ins.desc.${id}`)}</div>
              </div>
              <div className="row">
                <ReqTag id={id} />
                <button className="btn" disabled={busy || !st.data} onClick={exportXlsx}>⬇ {t('common.export_excel')}</button>
              </div>
            </div>

            <div className="form-grid">
              {applies.includes('dates') && (
                <>
                  <Field label={t('ins.f.from')}><input type="date" value={form.from || ''} onChange={(e) => set('from', e.target.value)} /></Field>
                  <Field label={t('ins.f.to')}><input type="date" value={form.to || ''} onChange={(e) => set('to', e.target.value)} /></Field>
                </>
              )}
              {applies.includes('ay') && sel('ay', (lookups.academic_years || []).map((y) => [y.code, y.code]))}
              {applies.includes('emirate') && sel('emirate', [['SHJ', t('ins.emirate.SHJ')]])}
              {applies.includes('cluster') && sel('cluster', (lookups.clusters || []).map((c) => [c.id, L(c)]), { locked: clusterLocked || schoolLocked })}
              {applies.includes('school') && sel('school', schools.map((s) => [s.id, L(s)]), { locked: schoolLocked })}
              {applies.includes('cycle') && sel('cycle', Object.keys(lookups.cycles).map((c) => [c, t(`cycle.${c}`)]))}
              {applies.includes('grade') && sel('grade', grades.map((g) => [g, t(`grade.${g}`)]))}
              {applies.includes('section') && sel('section', ['A', 'B', 'C', 'D'].map((s) => [s, s]))}
              {applies.includes('gender') && sel('gender', [['M', t('common.male')], ['F', t('common.female')]])}
              {extra && sel(extra[0], extra[2].map((o) => [o, t(`${extra[1]}${o}`)]), { any: false })}
            </div>
            <div className="row mt">
              <button className="btn" onClick={apply} disabled={!draft}>{t('ins.run')}</button>
              <button className="btn secondary" onClick={reset}>{t('ins.reset')}</button>
              <span className="small muted">{scope}</span>
            </div>
            <div className="small muted mt" style={{ marginTop: 8 }}>
              {t(`ins.date_basis.${id}`, { default: '' })}{' '}
              {notApplicable.length > 0 && t('ins.na_filters', { list: notApplicable.join(', ') })}
            </div>
          </Card>

          <Loader state={st}>
            {(r) => <Result r={r} id={id} cell={cell} />}
          </Loader>
        </div>
      </div>
    </>
  );
}

function Result({ r, id, cell }) {
  const { t, fmtDate, fmtDateTime, fmtNum } = useI18n();
  const columns = r.columns.map((c) => ({ key: c, label: t(`col.${c}`), num: isNum(c), render: (row) => cell(row, c) }));
  const footer = r.totals ? Object.fromEntries(r.columns.map((c, i) => [c, i === 0 ? t('col.total') : r.totals[c] !== undefined ? cell(r.totals, c) : ''])) : null;
  const chart = r.chart && r.rows.length > 0 && r.rows.length <= 80 ? r.chart : null;
  const xLabel = chart && ((row) => {
    if (id === 'IR-04' && chart.x === 'grade' && r.columns.includes('school')) return `${cell(row, 'school')} · ${cell(row, 'grade')}`;
    return String(cell(row, chart.x));
  });
  return (
    <>
      <Card className="mt">
        <div className="row between small muted" style={{ marginBottom: 10 }}>
          <span>{t('ins.rows', { n: fmtNum(r.rows.length) })}{r.meta?.ay ? ` · ${t('col.ay')}: ${r.meta.ay}` : ''}</span>
          <span>{t('ins.generated', { at: fmtDateTime(r.generated_at) })}</span>
        </div>
        {r.meta?.range_this && (
          <div className="alert gold small mb">
            {t('ins.compare', { a: fmtDate(r.meta.range_this[0]), b: fmtDate(r.meta.range_this[1]), c: fmtDate(r.meta.range_last[0]), d: fmtDate(r.meta.range_last[1]) })}
          </div>
        )}
        {id === 'IR-01' && <div className="small muted mb">{t('ins.offered_note')}</div>}
        {chart && (
          <div className="mb">
            <Bars data={r.rows} x={chart.x} xLabel={xLabel} series={chart.series.map((s) => ({ key: s, label: t(`col.${s}`) }))}
              valueSuffix={chart.series.some((s) => s.endsWith('pct') || s === 'utilisation') ? '%' : ''} />
          </div>
        )}
        <DataTable columns={columns} rows={r.rows} footer={footer} maxHeight={560} />
      </Card>
      {id === 'IR-09' && (
        <Card className="mt" title={`${t('ins.overdue_list')} (${fmtNum(r.extra?.overdue?.length || 0)})`}>
          <DataTable rows={r.extra?.overdue || []} maxHeight={400} empty={t('ins.overdue_none')}
            columns={['ref', 'school', 'grade', 'submitted_at', 'sla_due_at'].map((c) => ({ key: c, label: c === 'sla_due_at' ? t('ins.due') : c === 'submitted_at' ? t('col.submitted') : t(`col.${c}`), render: (row) => (c === 'ref' ? <span className="mono">{row.ref}</span> : cell(row, c)) }))} />
        </Card>
      )}
    </>
  );
}
