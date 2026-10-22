// SB-01 / SB-06: application queue with filters and service-level flags.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, qs } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { useI18n } from '../../i18n.jsx';
import { useAsync, PageHead, Loader, DataTable, StatusBadge, SlaBadge, Stat } from '../../components/ui.jsx';

const STATUSES = ['submitted', 'under_review', 'info_requested', 'passed', 'escalated', 'offer_made', 'accepted', 'rejected', 'withdrawn', 'lapsed', 'closed'];
const PATHWAYS = ['new', 'private', 'other_emirate', 'abroad', 'moe_transfer'];

export function AppFlags({ a }) {
  const { t } = useI18n();
  return (
    <span className="row" style={{ gap: 4 }}>
      {a.sibling_here ? <span className="badge blue" title={t('bo.flag.sibling')}>{t('bo.flag.sibling_short')}</span> : null}
      {a.sod ? <span className="badge gold" title={t('bo.flag.sod')}>{t('bo.flag.sod_short')}</span> : null}
      {a.exceptional ? <span className="badge amber">{t('bo.flag.exceptional')}</span> : null}
      {a.out_of_catchment ? <span className="badge amber">{t('bo.flag.out_of_catchment')}</span> : null}
      {a.residence_route && a.residence_route !== 'own' ? <span className="badge amber">{t('bo.flag.alt_residence')}</span> : null}
    </span>
  );
}

export default function Queue() {
  const { t, L, fmtDateTime } = useI18n();
  const { me, lookups } = useAuth();
  const nav = useNavigate();
  const multiSchool = !['registrar', 'principal'].includes(me.role);
  const [f, setF] = useState({ grade: '', cycle: '', pathway: '', status: '', sla: '', q: '', school: '', view: '' });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const st = useAsync(() => api.get(`/queue${qs(f)}`), [JSON.stringify(f)]);
  const schools = (lookups?.schools || []).filter((s) => me.role !== 'cluster_officer' || s.cluster_id === me.cluster?.id);

  return (
    <>
      <PageHead title={t('nav.queue')} sub={me.school ? L(me.school) : t('bo.queue.sub_all')} reqs={['SB-01', 'SB-06', 'BR-05']} />
      {st.data && (
        <div className="grid c4 mb">
          <Stat label={t('bo.queue.in_view')} value={st.data.counts.total} accent />
          <Stat label={t('sla.on_time')} value={st.data.counts.on_time} />
          <Stat label={t('sla.due_today')} value={<span style={{ color: 'var(--amber-700)' }}>{st.data.counts.due_today}</span>} />
          <Stat label={t('sla.overdue')} value={<span style={{ color: 'var(--red-700)' }}>{st.data.counts.overdue}</span>} sub={t('bo.queue.overdue_hint')} />
        </div>
      )}
      <div className="card mb">
        <div className="form-grid">
          <label className="field"><span>{t('common.search')}</span><input value={f.q} onChange={set('q')} placeholder={t('bo.queue.search_ph')} /></label>
          {multiSchool && (
            <label className="field"><span>{t('common.school')}</span>
              <select value={f.school} onChange={set('school')}><option value="">{t('common.all')}</option>{schools.map((s) => <option key={s.id} value={s.id}>{L(s)}</option>)}</select>
            </label>
          )}
          <label className="field"><span>{t('common.cycle')}</span>
            <select value={f.cycle} onChange={set('cycle')}><option value="">{t('common.all')}</option>{['KG', 'C1', 'C2', 'C3'].map((c) => <option key={c} value={c}>{t(`cycle.${c}`)}</option>)}</select>
          </label>
          <label className="field"><span>{t('common.grade')}</span>
            <select value={f.grade} onChange={set('grade')}><option value="">{t('common.all')}</option>{(lookups?.grades || []).map((g) => <option key={g} value={g}>{t(`grade.${g}`)}</option>)}</select>
          </label>
          <label className="field"><span>{t('col.pathway')}</span>
            <select value={f.pathway} onChange={set('pathway')}><option value="">{t('common.all')}</option>{PATHWAYS.map((p) => <option key={p} value={p}>{t(`pathway.${p}`)}</option>)}</select>
          </label>
          <label className="field"><span>{t('common.status')}</span>
            <select value={f.status} onChange={set('status')}><option value="">{t('bo.queue.open_statuses')}</option>{STATUSES.map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}</select>
          </label>
          <label className="field"><span>{t('bo.queue.sla')}</span>
            <select value={f.sla} onChange={set('sla')}><option value="">{t('common.all')}</option>{['on_time', 'due_today', 'overdue', 'paused'].map((s) => <option key={s} value={s}>{t(`sla.${s}`)}</option>)}</select>
          </label>
        </div>
      </div>
      <Loader state={st}>
        {(d) => (
          <DataTable
            rows={d.rows}
            maxHeight="65vh"
            onRowClick={(r) => nav(`/school/applications/${r.id}`)}
            columns={[
              { key: 'ref', label: t('col.ref'), render: (r) => <span className="mono small nowrap">{r.ref}</span> },
              { key: 'child', label: t('bo.child'), render: (r) => L(r, 'child') },
              { key: 'grade', label: t('common.grade'), render: (r) => t(`grade.${r.grade}`) },
              { key: 'pathway', label: t('col.pathway'), render: (r) => <span className="small">{t(`pathway.${r.pathway}`)}</span> },
              ...(multiSchool ? [{ key: 'school', label: t('common.school'), render: (r) => <span className="small">{L(r, 'school')}</span> }] : []),
              { key: 'flags', label: t('bo.queue.flags'), render: (r) => <AppFlags a={r} /> },
              { key: 'submitted_at', label: t('col.submitted'), render: (r) => <span className="small nowrap">{fmtDateTime(r.submitted_at)}</span> },
              { key: 'sla', label: t('bo.queue.sla'), render: (r) => <SlaBadge sla={r.sla} /> },
              { key: 'priority_rank', label: t('bo.queue.priority'), num: true, render: (r) => r.priority_rank ? `#${r.priority_rank}` : '—' },
              { key: 'status', label: t('common.status'), render: (r) => <StatusBadge status={r.status} /> },
            ]}
          />
        )}
      </Loader>
    </>
  );
}
