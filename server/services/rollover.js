// Annual roll-over: carry the students of one academic year into the next as seats held for renewal
// (pending_renewal enrolments), so the renewal flow (PP-19) works for the new admission year.
// Safe to run more than once – students who already have a place in the target year are skipped.
import { all, get, insert, tx } from '../db/index.js';
import { nextGrade, nowIso, audit, AppError, windowStatus, admissionAY } from './core.js';
import { sectionSeats, checkAlerts } from './capacity.js';
import { notify, familyUsers } from './notify.js';

export const previousYear = (code) => {
  const y = Number(String(code).slice(0, 4)) - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
};

// Students who will be at school in the source year: enrolled, renewed or still expected to renew.
const sourceRows = (source) => all(
  `SELECT e.id, e.child_id, e.school_id, e.grade, e.status, s.name AS section_name
     FROM enrolments e LEFT JOIN sections s ON s.id = e.section_id
    WHERE e.ay = ? AND e.status IN ('enrolled', 'pending_renewal')`, source);

// Classify every source student for the target year.
function plan(target) {
  if (!get('SELECT 1 FROM academic_years WHERE code = ?', target)) throw new AppError(404, 'not_found');
  const source = previousYear(target);
  if (!get('SELECT 1 FROM academic_years WHERE code = ?', source)) throw new AppError(409, 'no_source_year', `Academic year ${source} does not exist`);
  const placed = new Set(all('SELECT DISTINCT child_id FROM enrolments WHERE ay = ?', target).map((r) => r.child_id));
  const offered = new Set(all('SELECT DISTINCT school_id || \':\' || grade k FROM sections WHERE ay = ?', target).map((r) => r.k));
  const schoolsWithCapacity = new Set(all('SELECT DISTINCT school_id FROM sections WHERE ay = ?', target).map((r) => r.school_id));
  const items = sourceRows(source).map((e) => {
    const g = nextGrade(e.grade);
    let outcome;
    if (placed.has(e.child_id)) outcome = 'already';
    else if (!g) outcome = 'graduating';
    else if (!schoolsWithCapacity.has(e.school_id)) outcome = 'capacity_missing';
    else if (!offered.has(`${e.school_id}:${g}`)) outcome = 'new_school';
    else outcome = 'roll';
    return { ...e, next_grade: g, outcome };
  });
  return { source, target, items };
}

function summarise({ source, target, items }) {
  const by = new Map();
  const totals = { roll: 0, already: 0, graduating: 0, new_school: 0, capacity_missing: 0 };
  for (const it of items) {
    totals[it.outcome]++;
    if (!by.has(it.school_id)) by.set(it.school_id, { school_id: it.school_id, roll: 0, already: 0, graduating: 0, new_school: 0, capacity_missing: 0 });
    by.get(it.school_id)[it.outcome]++;
  }
  const schools = all('SELECT id, code, name_en, name_ar FROM schools ORDER BY code');
  const rows = schools.filter((s) => by.has(s.id)).map((s) => ({ ...s, ...by.get(s.id) }));
  // grades that would go over capacity once the held seats are added
  const adding = new Map();
  for (const it of items) if (it.outcome === 'roll') adding.set(`${it.school_id}:${it.next_grade}`, (adding.get(`${it.school_id}:${it.next_grade}`) || 0) + 1);
  const over = [];
  for (const [k, n] of adding) {
    const [sid, grade] = k.split(':');
    const secs = sectionSeats(Number(sid), target, grade);
    const cap = secs.reduce((t, s) => t + s.capacity, 0), used = secs.reduce((t, s) => t + s.used, 0);
    if (used + n > cap) over.push({ school_id: Number(sid), ...schools.find((s) => s.id === Number(sid)), grade, capacity: cap, after: used + n });
  }
  return {
    source, target, totals, schools: rows, over_capacity: over,
    already_run: !!get(`SELECT 1 FROM audit_log WHERE action = 'rollover.completed' AND entity_id = ?`, target),
    renewal_window: windowStatus(target, 'renewal').window,
  };
}

export const preview = (target) => summarise(plan(target));

export function run(user, target) {
  const p = plan(target);
  const created = tx(() => {
    // in-memory section load so seats spread across sections as they are added
    const load = new Map();
    const sectionsFor = (sid, grade) => {
      const k = `${sid}:${grade}`;
      if (!load.has(k)) load.set(k, sectionSeats(sid, target, grade).map((s) => ({ id: s.id, name: s.name, free: s.capacity - s.used })));
      return load.get(k);
    };
    let n = 0;
    for (const it of p.items.filter((x) => x.outcome === 'roll')) {
      const secs = sectionsFor(it.school_id, it.next_grade);
      // stay with the same section letter when it has room, otherwise the section with most room
      const sec = secs.find((s) => s.name === it.section_name && s.free > 0) || [...secs].sort((a, b) => b.free - a.free)[0];
      insert('enrolments', { child_id: it.child_id, school_id: it.school_id, ay: target, grade: it.next_grade, section_id: sec.id, status: 'pending_renewal', source: 'rollover', created_at: nowIso() });
      sec.free--;
      n++;
    }
    return n;
  });
  const touched = new Set(p.items.filter((x) => x.outcome === 'roll').map((x) => `${x.school_id}:${x.next_grade}`));
  for (const k of touched) { const [sid, g] = k.split(':'); checkAlerts(Number(sid), target, g); }
  const summary = summarise(p);
  audit(user, 'rollover.completed', 'academic_year', target, null, { source: p.source, created, totals: { ...summary.totals, roll: created } });
  const notified = notifyRenewalWindow();
  return { ...summary, created, notified };
}

/* 4.5: "Renewal window opens → parents of current students: email and in-portal".
 * Sent once per admission year, when its renewal window is open and seats are held for renewal. */
export function notifyRenewalWindow() {
  const ay = admissionAY()?.code;
  if (!ay || !windowStatus(ay, 'renewal').open) return 0;
  if (get(`SELECT 1 FROM audit_log WHERE action = 'renewal.window_notified' AND entity_id = ?`, ay)) return 0;
  const kids = all(`SELECT DISTINCT c.id, c.family_id, c.full_name_en, c.full_name_ar FROM children c JOIN enrolments e ON e.child_id = c.id
                     WHERE e.ay = ? AND e.status = 'pending_renewal' AND c.family_id IS NOT NULL`, ay);
  for (const c of kids) notify('renewal_window_open', familyUsers(c.family_id), { child: { en: c.full_name_en, ar: c.full_name_ar } });
  audit(null, 'renewal.window_notified', 'academic_year', ay, null, { children: kids.length });
  return kids.length;
}
