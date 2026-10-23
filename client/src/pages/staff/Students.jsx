// Student directory: search the students enrolled this year and see what happens to each next year.
import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api, qs } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { useI18n } from '../../i18n.jsx';
import { useAsync, PageHead, Loader, DataTable, Stat } from '../../components/ui.jsx';

export const NEXT_COLOR = { renewed: 'green', awaiting: 'amber', leaving: 'red', transferring: 'blue', not_returning: '', moving_on: 'gold', graduating: '' };
export const NextBadge = ({ s }) => {
  const { t } = useI18n();
  return s ? <span className={`badge ${NEXT_COLOR[s] ?? ''}`}>{t(`bo.students.next.${s}`)}</span> : null;
};
const NEXT = ['renewed', 'awaiting', 'leaving', 'transferring', 'not_returning', 'moving_on', 'graduating'];

export default function Students() {
  const { t, L, fmtNum } = useI18n();
  const { me, lookups } = useAuth();
  const nav = useNavigate();
  const multiSchool = !['registrar', 'principal'].includes(me.role);
  const [f, setF] = useState({ q: '', school: '', grade: '', section: '', next: '' });
  const [q, setQ] = useState('');
  // search as you type, without a request per keystroke
  useEffect(() => { const h = setTimeout(() => setF((x) => ({ ...x, q })), 300); return () => clearTimeout(h); }, [q]);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const st = useAsync(() => api.get(`/school/students${qs(f)}`), [JSON.stringify(f)]);
  const schools = (lookups?.schools || []).filter((s) => me.role !== 'cluster_officer' || s.cluster_id === me.cluster?.id);

  return (
    <>
      <PageHead title={t('nav.students')} sub={me.school ? L(me.school) : t('bo.students.sub_all')} />
      {st.data && (
        <div className="grid c4 mb">
          <Stat label={t('bo.students.enrolled', { ay: st.data.current_ay })} value={fmtNum(st.data.all)} accent />
          <Stat label={t('bo.students.next.renewed')} value={fmtNum(st.data.counts.renewed || 0)} sub={t('bo.students.for_ay', { ay: st.data.next_ay })} />
          <Stat label={t('bo.students.next.awaiting')} value={<span style={{ color: 'var(--amber-700)' }}>{fmtNum(st.data.counts.awaiting || 0)}</span>} />
          <Stat label={t('bo.students.next.leaving')} value={<span style={{ color: 'var(--red-700)' }}>{fmtNum(st.data.counts.leaving || 0)}</span>} />
        </div>
      )}
      <div className="card mb">
        <div className="form-grid">
          <label className="field"><span>{t('common.search')}</span><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('bo.students.search_ph')} /></label>
          {multiSchool && (
            <label className="field"><span>{t('common.school')}</span>
              <select value={f.school} onChange={set('school')}><option value="">{t('common.all')}</option>{schools.map((s) => <option key={s.id} value={s.id}>{L(s)}</option>)}</select>
            </label>
          )}
          <label className="field"><span>{t('common.grade')}</span>
            <select value={f.grade} onChange={set('grade')}><option value="">{t('common.all')}</option>{(lookups?.grades || []).map((g) => <option key={g} value={g}>{t(`grade.${g}`)}</option>)}</select>
          </label>
          <label className="field"><span>{t('common.section')}</span>
            <select value={f.section} onChange={set('section')}><option value="">{t('common.all')}</option>{['A', 'B', 'C', 'D', 'E', 'F'].map((s) => <option key={s} value={s}>{s}</option>)}</select>
          </label>
          <label className="field"><span>{t('bo.students.next_year')}</span>
            <select value={f.next} onChange={set('next')}><option value="">{t('common.all')}</option>{NEXT.map((n) => <option key={n} value={n}>{t(`bo.students.next.${n}`)}</option>)}</select>
          </label>
        </div>
      </div>
      <Loader state={st}>
        {(d) => (
          <>
            <p className="small muted">{t('bo.students.showing', { n: fmtNum(d.rows.length), total: fmtNum(d.total) })}{d.limited ? ` ${t('bo.students.refine')}` : ''}</p>
            <DataTable
              rows={d.rows}
              maxHeight="65vh"
              onRowClick={(r) => nav(`/school/students/${r.id}`)}
              empty={t('bo.students.none')}
              columns={[
                { key: 'name', label: t('bo.students.student'), render: (r) => <><b>{L(r, 'full_name')}</b>{r.sod ? <> <span className="badge blue">{t('bo.students.sod')}</span></> : null}</> },
                { key: 'eid', label: t('uaepass.eid'), render: (r) => <span className="mono small nowrap">{r.emirates_id}</span> },
                { key: 'grade', label: t('common.grade'), render: (r) => <span className="nowrap">{t(`grade.${r.grade}`)}{r.section ? ` – ${r.section}` : ''}</span> },
                ...(multiSchool ? [{ key: 'school', label: t('common.school'), render: (r) => <span className="small">{L(r, 'school')}</span> }] : []),
                { key: 'gender', label: t('common.gender'), render: (r) => <span className="small">{t(r.gender === 'M' ? 'common.male' : 'common.female')}</span> },
                { key: 'next', label: t('bo.students.next_year_ay', { ay: d.next_ay }), render: (r) => <NextBadge s={r.next_year} /> },
                { key: 'family', label: t('bo.students.family'), render: (r) => <span className="small muted">{r.family_id ? t('bo.students.on_portal') : '—'}</span> },
              ]}
            />
          </>
        )}
      </Loader>
      <p className="small muted mt">{t('bo.students.leavers_hint')} <Link to="/school/leavers">{t('nav.leavers')} →</Link></p>
    </>
  );
}
