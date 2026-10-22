// Insights and reports IR-01 .. IR-10 (section 4.4). All figures are computed live from the
// transactional tables, so they are always current (requirement: at least hourly).
import { all, get, parse } from '../db/index.js';
import { CYCLES, cycleOf, GRADES, admissionAY, currentAY, today, pointInGeometry, workingHoursBetween, slaState, setting } from './core.js';
import { sectionSeats, schoolGrades } from './capacity.js';
import { transport } from '../mocks/index.js';

const PENDING = ['submitted', 'under_review', 'info_requested', 'passed', 'escalated'];

// Normalise filters and apply role scope (TR-02)
export function normFilters(q, user) {
  const f = {
    from: q.from || null, to: q.to || null, ay: q.ay || null, emirate: q.emirate || null,
    cluster: q.cluster ? Number(q.cluster) : null, school: q.school ? Number(q.school) : null,
    cycle: q.cycle || null, grade: q.grade || null, section: q.section || null, gender: q.gender || null,
    period: q.period || 'month', by: q.by || null,
  };
  if (['registrar', 'principal'].includes(user.role)) f.school = user.school_id;
  if (user.role === 'cluster_officer') f.cluster = user.cluster_id;
  return f;
}

function gradesFilter(f) {
  if (f.grade) return [f.grade];
  if (f.cycle) return CYCLES[f.cycle] || [];
  return null;
}

// WHERE clause over applications a / children c / schools s / sections sec
function appWhere(f, { dateCol = 'a.submitted_at', useDates = true, useAy = true } = {}) {
  const w = ['a.submitted_at IS NOT NULL'], p = [];
  if (useDates && f.from) { w.push(`date(${dateCol}) >= ?`); p.push(f.from); }
  if (useDates && f.to) { w.push(`date(${dateCol}) <= ?`); p.push(f.to); }
  if (useAy && f.ay) { w.push('a.ay = ?'); p.push(f.ay); }
  if (f.emirate) { w.push('cl.emirate = ?'); p.push(f.emirate); }
  if (f.cluster) { w.push('s.cluster_id = ?'); p.push(f.cluster); }
  if (f.school) { w.push('a.current_school_id = ?'); p.push(f.school); }
  const g = gradesFilter(f);
  if (g) { w.push(`a.grade IN (${g.map(() => '?').join(',')})`); p.push(...g); }
  if (f.section) { w.push('sec.name = ?'); p.push(f.section); }
  if (f.gender) { w.push('c.gender = ?'); p.push(f.gender); }
  return { sql: w.join(' AND '), p };
}
const APP_FROM = `FROM applications a JOIN children c ON c.id = a.child_id
  LEFT JOIN schools s ON s.id = a.current_school_id LEFT JOIN clusters cl ON cl.id = s.cluster_id
  LEFT JOIN sections sec ON sec.id = a.offered_section_id`;

function enrWhere(f, { dateCol = 'e.leave_date', useDates = true } = {}) {
  const w = ['1=1'], p = [];
  if (useDates && f.from) { w.push(`${dateCol} >= ?`); p.push(f.from); }
  if (useDates && f.to) { w.push(`${dateCol} <= ?`); p.push(f.to); }
  if (f.emirate) { w.push('cl.emirate = ?'); p.push(f.emirate); }
  if (f.cluster) { w.push('s.cluster_id = ?'); p.push(f.cluster); }
  if (f.school) { w.push('e.school_id = ?'); p.push(f.school); }
  const g = gradesFilter(f);
  if (g) { w.push(`e.grade IN (${g.map(() => '?').join(',')})`); p.push(...g); }
  if (f.section) { w.push('sec.name = ?'); p.push(f.section); }
  if (f.gender) { w.push('c.gender = ?'); p.push(f.gender); }
  return { sql: w.join(' AND '), p };
}
const ENR_FROM = `FROM enrolments e JOIN children c ON c.id = e.child_id JOIN schools s ON s.id = e.school_id
  JOIN clusters cl ON cl.id = s.cluster_id LEFT JOIN sections sec ON sec.id = e.section_id`;

const schoolsInScope = (f) => all(
  `SELECT s.* FROM schools s JOIN clusters cl ON cl.id = s.cluster_id WHERE 1=1
   ${f.school ? 'AND s.id = ' + Number(f.school) : ''} ${f.cluster ? 'AND s.cluster_id = ' + Number(f.cluster) : ''}
   ${f.emirate ? `AND cl.emirate = '${String(f.emirate).replace(/'/g, '')}'` : ''} ORDER BY s.id`
);
const sortGrade = (a, b) => GRADES.indexOf(a) - GRADES.indexOf(b);
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);

export const REPORTS = {
  /* IR-01 Registrations between dates */
  'IR-01'(f) {
    const fmt = f.period === 'day' ? '%Y-%m-%d' : f.period === 'week' ? '%Y-W%W' : '%Y-%m';
    const { sql, p } = appWhere(f);
    const rows = all(
      `SELECT strftime('${fmt}', a.submitted_at) period, COUNT(*) submitted,
         SUM(a.status = 'offer_made') offered, SUM(a.status = 'accepted') accepted, SUM(a.status = 'rejected') rejected,
         SUM(a.status IN (${PENDING.map(() => '?').join(',')})) pending,
         SUM(a.status IN ('withdrawn','lapsed','closed')) withdrawn
       ${APP_FROM} WHERE ${sql} GROUP BY period ORDER BY period`,
      ...PENDING, ...p
    );
    return { columns: ['period', 'submitted', 'offered', 'accepted', 'rejected', 'pending', 'withdrawn'], rows, totals: sumRows(rows, ['submitted', 'offered', 'accepted', 'rejected', 'pending', 'withdrawn']), chart: { type: 'bar', x: 'period', series: ['submitted', 'accepted'] } };
  },
  /* IR-02 Registration type */
  'IR-02'(f) {
    const { sql, p } = appWhere(f);
    const rows = all(`SELECT a.type, a.pathway, COUNT(*) applications, SUM(a.status = 'accepted') accepted ${APP_FROM} WHERE ${sql} GROUP BY a.type, a.pathway ORDER BY a.type, a.pathway`, ...p);
    return { columns: ['type', 'pathway', 'applications', 'accepted'], rows, totals: sumRows(rows, ['applications', 'accepted']), chart: { type: 'bar', x: 'pathway', series: ['applications'] } };
  },
  /* IR-03 Year-on-year comparison (same date range last year) */
  'IR-03'(f) {
    const by = ['cycle', 'grade', 'section'].includes(f.by) ? f.by : 'grade';
    const to = f.to || today();
    const from = f.from || `${Number(to.slice(0, 4)) - (to.slice(5) < '09-01' ? 1 : 0)}-09-01`;
    const shift = (d) => `${Number(d.slice(0, 4)) - 1}${d.slice(4)}`;
    const run = (a, b) => {
      const { sql, p } = appWhere({ ...f, from: a, to: b, ay: null });
      const keyExpr = by === 'section' ? `a.grade || '-' || sec.name` : 'a.grade';
      const extra = by === 'section' ? ' AND sec.name IS NOT NULL' : '';
      return Object.fromEntries(all(`SELECT ${keyExpr} k, COUNT(*) n ${APP_FROM} WHERE ${sql}${extra} GROUP BY k`, ...p).map((r) => [r.k, r.n]));
    };
    const cur = run(from, to), prev = run(shift(from), shift(to));
    const fold = (m) => {
      if (by !== 'cycle') return m;
      const o = {};
      for (const [k, n] of Object.entries(m)) o[cycleOf(k)] = (o[cycleOf(k)] || 0) + n;
      return o;
    };
    const c = fold(cur), pv = fold(prev);
    const keys = [...new Set([...Object.keys(c), ...Object.keys(pv)])].sort((a, b) => (by === 'cycle' ? a.localeCompare(b) : sortGrade(a.split('-')[0], b.split('-')[0]) || a.localeCompare(b)));
    const rows = keys.map((k) => ({ [by]: k, this_year: c[k] || 0, last_year: pv[k] || 0, change: (c[k] || 0) - (pv[k] || 0), change_pct: pv[k] ? Math.round((((c[k] || 0) - pv[k]) / pv[k]) * 1000) / 10 : null }));
    const totals = sumRows(rows, ['this_year', 'last_year', 'change']);
    totals.change_pct = totals.last_year ? Math.round((totals.change / totals.last_year) * 1000) / 10 : null;
    return { columns: [by, 'this_year', 'last_year', 'change', 'change_pct'], rows, totals, meta: { range_this: [from, to], range_last: [shift(from), shift(to)] }, chart: { type: 'bar', x: by, series: ['last_year', 'this_year'] } };
  },
  /* IR-04 Capacity utilisation */
  'IR-04'(f) {
    const ay = f.ay || admissionAY().code;
    const by = f.by === 'section' ? 'section' : f.by === 'school' ? 'school' : 'grade';
    const g = gradesFilter(f);
    const rows = [];
    for (const s of schoolsInScope(f)) {
      let secs = sectionSeats(s.id, ay).filter((x) => (!g || g.includes(x.grade)) && (!f.section || x.name === f.section));
      if (by === 'section') secs.forEach((x) => rows.push({ school: s.name_en, school_ar: s.name_ar, grade: x.grade, section: x.name, ...pick(x) }));
      else if (by === 'grade') {
        for (const gr of [...new Set(secs.map((x) => x.grade))].sort(sortGrade)) rows.push({ school: s.name_en, school_ar: s.name_ar, grade: gr, ...agg(secs.filter((x) => x.grade === gr)) });
      } else if (secs.length) rows.push({ school: s.name_en, school_ar: s.name_ar, ...agg(secs) });
    }
    const cols = by === 'section' ? ['school', 'grade', 'section'] : by === 'grade' ? ['school', 'grade'] : ['school'];
    const totals = agg(rows.map((r) => ({ capacity: r.capacity, enrolled: r.enrolled, offered: r.offered, held: r.held })));
    return { columns: [...cols, 'capacity', 'enrolled', 'held', 'offered', 'available', 'utilisation'], rows, totals, meta: { ay }, chart: { type: 'bar', x: by === 'school' ? 'school' : 'grade', series: ['utilisation'] } };
  },
  /* IR-05 Capacity alerts */
  'IR-05'(f) {
    const w = ['1=1'], p = [];
    if (f.from) { w.push('date(ca.reached_at) >= ?'); p.push(f.from); }
    if (f.to) { w.push('date(ca.reached_at) <= ?'); p.push(f.to); }
    if (f.ay) { w.push('ca.ay = ?'); p.push(f.ay); }
    if (f.school) { w.push('ca.school_id = ?'); p.push(f.school); }
    if (f.cluster) { w.push('s.cluster_id = ?'); p.push(f.cluster); }
    if (f.emirate) { w.push('cl.emirate = ?'); p.push(f.emirate); }
    const g = gradesFilter(f);
    if (g) { w.push(`ca.grade IN (${g.map(() => '?').join(',')})`); p.push(...g); }
    if (f.by !== 'all') w.push('ca.cleared_at IS NULL');
    const rows = all(`SELECT s.name_en school, s.name_ar school_ar, ca.ay, COALESCE(ca.grade, 'ALL') grade, ca.level, ca.utilisation, ca.reached_at, ca.cleared_at
                        FROM capacity_alerts ca JOIN schools s ON s.id = ca.school_id JOIN clusters cl ON cl.id = s.cluster_id WHERE ${w.join(' AND ')} ORDER BY ca.level DESC, ca.reached_at DESC`, ...p);
    return { columns: ['school', 'ay', 'grade', 'level', 'utilisation', 'reached_at', 'cleared_at'], rows };
  },
  /* IR-06 Catchment demand & unmet demand */
  'IR-06'(f) {
    const ay = f.ay || admissionAY().code;
    const { sql, p } = appWhere({ ...f, school: null, cluster: null, emirate: null, ay });
    const apps = all(`SELECT a.id, a.home_lat, a.home_lng, a.grade, a.status, a.out_of_catchment, a.preferences, a.escalation_reason ${APP_FROM} WHERE ${sql} AND a.home_lat IS NOT NULL`, ...p);
    const g = gradesFilter(f);
    const rows = schoolsInScope(f).map((s) => {
      const geom = parse(get('SELECT geojson FROM catchments WHERE school_id = ?', s.id)?.geojson);
      const grades = schoolGrades(s.id, ay).filter((x) => !g || g.includes(x));
      const inC = apps.filter((a) => grades.includes(a.grade) && pointInGeometry(a.home_lat, a.home_lng, geom));
      const secs = sectionSeats(s.id, ay).filter((x) => grades.includes(x.grade));
      const avail = secs.reduce((t, x) => t + Math.max(0, x.available), 0);
      const firstPref = apps.filter((a) => parse(a.preferences, [])[0] === s.id).length;
      const unmet = inC.filter((a) => a.out_of_catchment || (a.status === 'escalated' && a.escalation_reason === 'no_seat')).length;
      return { school: s.name_en, school_ar: s.name_ar, applications_in_catchment: inC.length, first_preference: firstPref, available_seats: avail, demand_ratio: avail ? Math.round((inC.length / avail) * 100) / 100 : null, unmet_demand: unmet };
    });
    return { columns: ['school', 'applications_in_catchment', 'first_preference', 'available_seats', 'demand_ratio', 'unmet_demand'], rows, totals: sumRows(rows, ['applications_in_catchment', 'first_preference', 'available_seats', 'unmet_demand']), meta: { ay }, chart: { type: 'bar', x: 'school', series: ['applications_in_catchment', 'available_seats'] } };
  },
  /* IR-07 Leavers */
  'IR-07'(f) {
    const by = ['reason', 'subreason', 'cycle', 'grade', 'school'].includes(f.by) ? f.by : 'subreason';
    const { sql, p } = enrWhere(f);
    const list = all(`SELECT e.leave_reason reason, e.leave_subreason subreason, e.grade, s.name_en school, s.name_ar school_ar, e.leave_date, c.gender
                        ${ENR_FROM} WHERE ${sql} AND e.status IN ('leaving','left') AND e.ay = ? AND e.leave_reason NOT IN ('transfer_out','graduated')`, ...p, f.ay || currentAY().code);
    const labels = Object.fromEntries(all(`SELECT list_type || ':' || code k, label_en, label_ar FROM lists WHERE list_type IN ('leave_reason','leave_subreason')`).map((r) => [r.k, r]));
    const keyOf = (r) => by === 'cycle' ? cycleOf(r.grade) : by === 'reason' ? r.reason : by === 'subreason' ? `${r.reason}|${r.subreason || '-'}` : by === 'school' ? r.school : r.grade;
    const m = new Map();
    for (const r of list) {
      const k = keyOf(r);
      if (!m.has(k)) {
        const base = by === 'subreason' || by === 'reason'
          ? { reason: labels[`leave_reason:${r.reason}`]?.label_en || r.reason, reason_ar: labels[`leave_reason:${r.reason}`]?.label_ar, ...(by === 'subreason' ? { subreason: labels[`leave_subreason:${r.subreason}`]?.label_en || r.subreason || '—', subreason_ar: labels[`leave_subreason:${r.subreason}`]?.label_ar } : {}) }
          : by === 'school' ? { school: r.school, school_ar: r.school_ar } : { [by]: k };
        m.set(k, { ...base, leavers: 0, male: 0, female: 0 });
      }
      const row = m.get(k);
      row.leavers++; r.gender === 'M' ? row.male++ : row.female++;
    }
    const rows = [...m.values()].sort((a, b) => b.leavers - a.leavers);
    const cols = by === 'subreason' ? ['reason', 'subreason'] : [by];
    return { columns: [...cols, 'leavers', 'male', 'female'], rows, totals: sumRows(rows, ['leavers', 'male', 'female']), chart: { type: 'bar', x: cols[cols.length - 1], series: ['leavers'] } };
  },
  /* IR-08 Net enrolment change */
  'IR-08'(f) {
    const by = ['school', 'cycle', 'grade'].includes(f.by) ? f.by : 'school';
    const ap = appWhere(f, { dateCol: 'a.decided_at' });
    const accepted = all(`SELECT a.type, a.pathway, a.grade, s.name_en school, s.name_ar school_ar ${APP_FROM} WHERE ${ap.sql} AND a.status = 'accepted' AND a.type IN ('new','transfer')`, ...ap.p);
    const en = enrWhere(f);
    // A leaver's seat held for next year is released with the same reason – that record is not a second leaver,
    // so network leavers are counted on the year they actually left; transfers out are recorded on the admission year.
    const left = all(`SELECT e.leave_reason, e.grade, s.name_en school, s.name_ar school_ar ${ENR_FROM} WHERE ${en.sql} AND e.status IN ('left','leaving') AND e.leave_reason != 'graduated'
                        AND (e.leave_reason = 'transfer_out' OR e.ay != ?)`, ...en.p, admissionAY().code);
    const k = (r) => (by === 'cycle' ? cycleOf(r.grade) : r[by]);
    const m = new Map();
    const row = (r) => {
      const key = k(r);
      if (!m.has(key)) m.set(key, { [by]: key, ...(by === 'school' ? { school_ar: r.school_ar } : {}), new_registrations: 0, transfers_in: 0, leavers: 0, transfers_out: 0, net_change: 0 });
      return m.get(key);
    };
    for (const a of accepted) a.type === 'new' ? row(a).new_registrations++ : row(a).transfers_in++;
    for (const e of left) e.leave_reason === 'transfer_out' ? row(e).transfers_out++ : row(e).leavers++;
    const rows = [...m.values()].map((r) => ({ ...r, net_change: r.new_registrations + r.transfers_in - r.leavers - r.transfers_out }))
      .sort((a, b) => (by === 'grade' ? sortGrade(a.grade, b.grade) : String(a[by]).localeCompare(String(b[by]))));
    return { columns: [by, 'new_registrations', 'transfers_in', 'leavers', 'transfers_out', 'net_change'], rows, totals: sumRows(rows, ['new_registrations', 'transfers_in', 'leavers', 'transfers_out', 'net_change']), chart: { type: 'bar', x: by, series: ['net_change'] } };
  },
  /* IR-09 Service level */
  'IR-09'(f) {
    const { sql, p } = appWhere(f);
    const apps = all(`SELECT a.id, a.ref, a.status, a.submitted_at, a.first_decision_at, a.sla_due_at, a.grade, s.id school_id, s.name_en school, s.name_ar school_ar ${APP_FROM} WHERE ${sql} AND a.type != 'renewal' AND a.sla_due_at IS NOT NULL`, ...p);
    const m = new Map();
    const overdue = [];
    for (const a of apps) {
      if (!m.has(a.school_id)) m.set(a.school_id, { school: a.school, school_ar: a.school_ar, decided: 0, within_sla: 0, hours: 0, open: 0, overdue: 0 });
      const r = m.get(a.school_id);
      if (a.first_decision_at) {
        r.decided++;
        if (a.first_decision_at <= a.sla_due_at) r.within_sla++;
        r.hours += workingHoursBetween(a.submitted_at, a.first_decision_at);
      } else if (['submitted', 'under_review', 'passed', 'info_requested'].includes(a.status)) {
        r.open++;
        if (slaState(a) === 'overdue') { r.overdue++; overdue.push({ ref: a.ref, school: a.school, school_ar: a.school_ar, grade: a.grade, submitted_at: a.submitted_at, sla_due_at: a.sla_due_at }); }
      }
    }
    const rows = [...m.values()].map((r) => ({ school: r.school, school_ar: r.school_ar, decided: r.decided, within_sla: r.within_sla, within_sla_pct: pct(r.within_sla, r.decided), avg_decision_days: r.decided ? Math.round((r.hours / r.decided / 24) * 10) / 10 : null, open: r.open, overdue: r.overdue }));
    const t = sumRows(rows, ['decided', 'within_sla', 'open', 'overdue']);
    t.within_sla_pct = pct(t.within_sla, t.decided);
    return { columns: ['school', 'decided', 'within_sla', 'within_sla_pct', 'avg_decision_days', 'open', 'overdue'], rows, totals: t, extra: { overdue }, chart: { type: 'bar', x: 'school', series: ['within_sla_pct'] } };
  },
  /* IR-10 Transport demand */
  'IR-10'(f) {
    const ay = f.ay || admissionAY().code;
    const inScope = new Set(schoolsInScope(f).map((s) => s.id));
    const routes = all('SELECT * FROM transport_routes ORDER BY code').filter((r) => parse(r.school_ids, []).some((id) => inScope.has(id)));
    const rows = routes.map((r) => {
      const l = transport.routeLoad(r.id, ay);
      return { route: `${r.code} – ${r.name_en}`, route_ar: `${r.code} – ${r.name_ar}`, capacity: r.capacity, requests: l.held + l.confirmed + l.waitlisted, confirmed: l.confirmed, bus_held: l.held, waitlisted: l.waitlisted, utilisation: pct(l.held + l.confirmed, r.capacity) };
    });
    return { columns: ['route', 'capacity', 'requests', 'confirmed', 'bus_held', 'waitlisted', 'utilisation'], rows, totals: sumRows(rows, ['capacity', 'requests', 'confirmed', 'bus_held', 'waitlisted']), meta: { ay }, chart: { type: 'bar', x: 'route', series: ['requests', 'capacity'] } };
  },
};

function pick(x) {
  return { capacity: x.capacity, enrolled: x.enrolled, held: x.held, offered: x.offered, available: x.available, utilisation: x.utilisation };
}
function agg(list) {
  const t = list.reduce((a, x) => ({ capacity: a.capacity + x.capacity, enrolled: a.enrolled + x.enrolled, held: a.held + x.held, offered: a.offered + x.offered }), { capacity: 0, enrolled: 0, held: 0, offered: 0 });
  const used = t.enrolled + t.held + t.offered;
  return { ...t, available: t.capacity - used, utilisation: pct(used, t.capacity) };
}
function sumRows(rows, keys) {
  const t = {};
  for (const k of keys) t[k] = rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
  return t;
}

export function dashboard(user) {
  const f = normFilters({}, user);
  const ay = admissionAY().code;
  const { sql, p } = appWhere({ ...f, ay });
  const st = get(`SELECT COUNT(*) total, SUM(a.status='offer_made') offered, SUM(a.status='accepted') accepted,
      SUM(a.status IN ('submitted','under_review','info_requested','passed','escalated')) pending,
      SUM(a.status='escalated') escalated, SUM(a.status='rejected') rejected ${APP_FROM} WHERE ${sql}`, ...p);
  const cap = REPORTS['IR-04']({ ...f, ay, by: 'school' });
  const alerts = REPORTS['IR-05']({ ...f, ay: null });
  const sla = REPORTS['IR-09']({ ...f, ay });
  const leavers = REPORTS['IR-07']({ ...f, by: 'reason' });
  const transportR = REPORTS['IR-10']({ ...f });
  const byStatus = all(`SELECT a.status, COUNT(*) n ${APP_FROM} WHERE ${sql} GROUP BY a.status`, ...p);
  return {
    ay, applications: st, by_status: byStatus,
    capacity: { ...cap.totals, schools: cap.rows },
    alerts: alerts.rows,
    sla: { ...sla.totals, overdue_list: sla.extra.overdue.slice(0, 10) },
    leavers: leavers.rows, leavers_total: leavers.totals.leavers,
    transport: transportR.rows,
    warning_threshold: setting('capacity_warning_threshold', 90),
  };
}
