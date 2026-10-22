// Capacity and seat tracking (CC-01, CC-02, CC-04, CC-05, CC-07).
import { all, get, insert, update } from '../db/index.js';
import { setting, nowIso, GRADES, audit } from './core.js';
import { notify, schoolStaff, clusterOfficers, ministryAdmins, ministryViewers } from './notify.js';

/* Seat states per section
 *  enrolled = enrolments enrolled/leaving (a leaver keeps the seat until the leaving date)
 *  held     = seats held for current students awaiting renewal (pending_renewal)
 *  offered  = outstanding offers (status offer_made)
 *  available = capacity - enrolled - held - offered   (negative only after force registration) */
export function sectionSeats(schoolId, ay, grade) {
  const params = grade ? [schoolId, ay, grade] : [schoolId, ay];
  return all(
    `SELECT s.id, s.school_id, s.grade, s.name, s.max_students AS capacity,
       (SELECT COUNT(*) FROM enrolments e WHERE e.section_id = s.id AND e.status IN ('enrolled','leaving')) AS enrolled,
       (SELECT COUNT(*) FROM enrolments e WHERE e.section_id = s.id AND e.status = 'pending_renewal') AS held,
       (SELECT COUNT(*) FROM applications a WHERE a.offered_section_id = s.id AND a.status = 'offer_made') AS offered
     FROM sections s WHERE s.school_id = ? AND s.ay = ? ${grade ? 'AND s.grade = ?' : ''}
     ORDER BY s.grade, s.name`,
    ...params
  ).map(withAvail);
}

function withAvail(r) {
  const used = r.enrolled + r.held + r.offered;
  return { ...r, used, available: r.capacity - used, utilisation: r.capacity ? Math.round((used / r.capacity) * 1000) / 10 : 0 };
}

export function gradeSeats(schoolId, ay, grade) {
  const secs = sectionSeats(schoolId, ay, grade);
  if (!secs.length) return null;
  const t = secs.reduce((a, s) => ({ capacity: a.capacity + s.capacity, enrolled: a.enrolled + s.enrolled, held: a.held + s.held, offered: a.offered + s.offered }), { capacity: 0, enrolled: 0, held: 0, offered: 0 });
  const g = withAvail(t);
  return { ...g, grade, sections: secs, status: seatStatus(g), closed: g.available <= 0 };
}

// Available / Limited / Full shown to parents (PP-10). CC-04: grade closes automatically at 100%.
export function seatStatus(g) {
  if (g.available <= 0) return 'full';
  const limitedPct = setting('limited_seat_pct', 10);
  if (g.available <= Math.max(1, Math.ceil((g.capacity * limitedPct) / 100))) return 'limited';
  return 'available';
}

export function schoolGrades(schoolId, ay) {
  return all('SELECT DISTINCT grade FROM sections WHERE school_id = ? AND ay = ?', schoolId, ay)
    .map((r) => r.grade)
    .sort((a, b) => GRADES.indexOf(a) - GRADES.indexOf(b));
}

export function schoolSummary(schoolId, ay) {
  const grades = schoolGrades(schoolId, ay).map((g) => gradeSeats(schoolId, ay, g));
  const t = grades.reduce((a, g) => ({ capacity: a.capacity + g.capacity, enrolled: a.enrolled + g.enrolled, held: a.held + g.held, offered: a.offered + g.offered }), { capacity: 0, enrolled: 0, held: 0, offered: 0 });
  return { ...withAvail(t), grades };
}

// Best section for an offer: the one with most free seats.
export function pickSection(schoolId, ay, grade) {
  const secs = sectionSeats(schoolId, ay, grade).filter((s) => s.available > 0).sort((a, b) => b.available - a.available);
  return secs[0] || null;
}

/* CC-07: raise / clear threshold alerts after any seat change.
 * Called inside the same transaction that changed the seats. */
export function checkAlerts(schoolId, ay, grade) {
  const warn = setting('capacity_warning_threshold', 90);
  const school = get('SELECT * FROM schools WHERE id = ?', schoolId);
  const evaluate = (g, scope) => {
    if (!scope) return;
    const pct = scope.capacity ? (scope.used / scope.capacity) * 100 : 0;
    for (const level of [warn, 100]) {
      const open = get(
        `SELECT * FROM capacity_alerts WHERE school_id = ? AND ay = ? AND ${g ? 'grade = ?' : 'grade IS NULL'} AND level = ? AND cleared_at IS NULL`,
        ...(g ? [schoolId, ay, g, level] : [schoolId, ay, level])
      );
      if (pct >= level && !open) {
        insert('capacity_alerts', { school_id: schoolId, ay, grade: g, level, utilisation: Math.round(pct * 10) / 10, reached_at: nowIso() });
        const recipients = [...schoolStaff(schoolId, ['principal']), ...clusterOfficers(schoolId), ...ministryAdmins()];
        const vars = { school: { en: school.name_en, ar: school.name_ar }, grade: g || '—', level, pct: Math.round(pct), ay };
        notify(level >= 100 ? 'capacity_full' : 'capacity_warning', recipients, vars);
        notify(level >= 100 ? 'capacity_full' : 'capacity_warning', ministryViewers(), vars, { channels: ['inapp'] });
      } else if (pct < level && open) {
        update('capacity_alerts', open.id, { cleared_at: nowIso() });
      }
    }
  };
  if (grade) evaluate(grade, gradeSeats(schoolId, ay, grade));
  evaluate(null, schoolSummary(schoolId, ay));
}

/* CC-01 / CC-08: set sections and max students for a grade. Existing section names are kept;
 * sections are only removed if they hold nobody. */
export function setGradeConfig(user, { schoolId, ay, grade, sections, maxStudents, offered = true }) {
  const before = all('SELECT name, max_students FROM sections WHERE school_id = ? AND ay = ? AND grade = ? ORDER BY name', schoolId, ay, grade);
  const want = offered ? Number(sections) : 0;
  const names = Array.from({ length: want }, (_, i) => String.fromCharCode(65 + i));
  for (const n of names) {
    const ex = get('SELECT id FROM sections WHERE school_id = ? AND ay = ? AND grade = ? AND name = ?', schoolId, ay, grade, n);
    if (ex) update('sections', ex.id, { max_students: Number(maxStudents) });
    else insert('sections', { school_id: schoolId, ay, grade, name: n, max_students: Number(maxStudents) });
  }
  const blocked = [];
  for (const s of all('SELECT * FROM sections WHERE school_id = ? AND ay = ? AND grade = ?', schoolId, ay, grade)) {
    if (names.includes(s.name)) continue;
    const used = get(`SELECT (SELECT COUNT(*) FROM enrolments WHERE section_id = ? AND status IN ('enrolled','leaving','pending_renewal')) + (SELECT COUNT(*) FROM applications WHERE offered_section_id = ? AND status = 'offer_made') n`, s.id, s.id).n;
    if (used) blocked.push(s.name);
    else {
      // detach historic references before removing
      update('enrolments', s.id, { section_id: null }, 'section_id');
      update('applications', s.id, { offered_section_id: null }, 'offered_section_id');
      all('DELETE FROM sections WHERE id = ? RETURNING id', s.id);
    }
  }
  const after = all('SELECT name, max_students FROM sections WHERE school_id = ? AND ay = ? AND grade = ? ORDER BY name', schoolId, ay, grade);
  audit(user, 'capacity.grade_config', 'school_grade', `${schoolId}:${ay}:${grade}`, before, after);
  checkAlerts(schoolId, ay, grade);
  return { sections: after, blocked };
}
