// Shared domain utilities: clock, settings (rules as data), grades, working days, geometry.
import { all, get, run, insert, parse } from '../db/index.js';

/* ---------------- Clock ----------------
 * A demo clock offset (settings.demo_clock_offset_days) lets presenters move "today"
 * forward to show SLA breaches, offer lapses and leaving-date seat releases. */
let offsetCache = null;
export function clockOffsetDays() {
  if (offsetCache === null) offsetCache = Number(setting('demo_clock_offset_days', 0)) || 0;
  return offsetCache;
}
export function now() {
  return new Date(Date.now() + clockOffsetDays() * 86400000);
}
export const nowIso = () => now().toISOString();
export const today = () => isoDate(now());
export const isoDate = (d) => new Date(d).toISOString().slice(0, 10);

/* ---------------- Settings (AD-02 / TR-03) ---------------- */
const settingsCache = new Map();
export function setting(key, fallback = null) {
  if (settingsCache.has(key)) return settingsCache.get(key);
  const row = get('SELECT value FROM settings WHERE key = ?', key);
  const v = row ? parse(row.value, fallback) : fallback;
  settingsCache.set(key, v);
  return v;
}
export function putSetting(key, value) {
  run(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    key, JSON.stringify(value), nowIso()
  );
  settingsCache.delete(key);
  if (key === 'demo_clock_offset_days') offsetCache = null;
  holidayCache = null;
}
export function clearCaches() {
  settingsCache.clear();
  offsetCache = null;
  holidayCache = null;
}

/* ---------------- Grades & cycles ---------------- */
export const GRADES = ['KG1', 'KG2', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'G10', 'G11', 'G12'];
export const CYCLES = { KG: ['KG1', 'KG2'], C1: ['G1', 'G2', 'G3', 'G4'], C2: ['G5', 'G6', 'G7', 'G8'], C3: ['G9', 'G10', 'G11', 'G12'] };
export function cycleOf(grade) {
  for (const [c, gs] of Object.entries(CYCLES)) if (gs.includes(grade)) return c;
  return null;
}
export const gradeIndex = (g) => GRADES.indexOf(g);
export const nextGrade = (g) => (gradeIndex(g) >= 0 && gradeIndex(g) < GRADES.length - 1 ? GRADES[gradeIndex(g) + 1] : null);

/* ---------------- Academic years ---------------- */
export const currentAY = () => get('SELECT * FROM academic_years WHERE is_current = 1');
export const admissionAY = () => get('SELECT * FROM academic_years WHERE is_admission = 1');
export const ayStartYear = (ay) => Number(String(ay).slice(0, 4));

export function windowStatus(ay, type) {
  const w = get('SELECT * FROM windows WHERE ay = ? AND type = ?', ay, type);
  if (!w) return { open: false, window: null };
  const t = today();
  return { open: t >= w.open_date && t <= w.close_date, window: w };
}

/* BR-01 / BR-02: eligible grade
 * New entrants: age on the cut-off date (default 31 Dec) of the admission year (BR-01).
 * Transfers: per pathway, either the next grade after the last completed grade or placement by age (BR-02). */
export const TRANSFER_GRADE_MODES = ['next_after_last_completed', 'by_age'];
export function transferGradeMode(pathway) {
  const r = setting('transfer_grade_rule', 'next_after_last_completed');
  const mode = typeof r === 'string' ? r : r?.[pathway] ?? r?.default ?? 'next_after_last_completed';
  return TRANSFER_GRADE_MODES.includes(mode) ? mode : 'next_after_last_completed';
}

export function eligibleGrade({ dob, lastCompletedGrade, pathway }, ay = admissionAY().code) {
  if (lastCompletedGrade && pathway !== 'new') {
    if (transferGradeMode(pathway) === 'next_after_last_completed' || !dob) {
      const g = nextGrade(lastCompletedGrade);
      return g ? { grade: g, cycle: cycleOf(g), rule: 'BR-02' } : { grade: null, rule: 'BR-02', reason: 'completed_g12' };
    }
    return { ...gradeByAge(dob, ay), rule: 'BR-02' };
  }
  return gradeByAge(dob, ay);
}

function gradeByAge(dob, ay) {
  const r = setting('grade_age_rules');
  const year = ayStartYear(ay);
  const [mm, dd] = r.cutoff.split('-').map(Number);
  const cutoff = new Date(Date.UTC(year, mm - 1, dd));
  const b = new Date(dob + 'T00:00:00Z');
  let age = cutoff.getUTCFullYear() - b.getUTCFullYear();
  if (cutoff.getUTCMonth() < b.getUTCMonth() || (cutoff.getUTCMonth() === b.getUTCMonth() && cutoff.getUTCDate() < b.getUTCDate())) age--;
  // Explicit mapping for entry grades, then one grade per extra year of age
  const entries = Object.entries(r.ages).sort((a, z) => a[1] - z[1]);
  const exact = entries.find(([, a]) => a === age);
  let grade = exact ? exact[0] : null;
  if (!grade) {
    const [lastG, lastAge] = entries[entries.length - 1];
    if (age > lastAge) grade = GRADES[gradeIndex(lastG) + (age - lastAge)] || null;
  }
  return { grade, cycle: grade ? cycleOf(grade) : null, age, rule: 'BR-01', reason: grade ? null : age < entries[0][1] ? 'too_young' : 'too_old' };
}

/* ---------------- Working days (AD-04) ---------------- */
let holidayCache = null;
function holidays() {
  if (!holidayCache) holidayCache = new Set(all('SELECT date FROM holidays').map((h) => h.date));
  return holidayCache;
}
export function isWorkingDay(d) {
  const days = setting('working_weekdays', [1, 2, 3, 4, 5]);
  const dt = new Date(d);
  return days.includes(dt.getUTCDay()) && !holidays().has(isoDate(dt));
}
// Due date = end of the n-th working day after the start (start day itself does not count).
export function addWorkingDays(start, n) {
  const d = new Date(start);
  let added = 0;
  while (added < n) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (isWorkingDay(d)) added++;
  }
  d.setUTCHours(23, 59, 59, 0);
  return d.toISOString();
}
// Working days elapsed between two instants (counts working days strictly after `from` up to and including `to`).
export function workingDaysBetween(from, to) {
  const a = new Date(from), b = new Date(to);
  if (b <= a) return 0;
  let n = 0;
  const d = new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate()));
  const end = isoDate(b);
  while (isoDate(d) < end) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (isWorkingDay(d)) n++;
  }
  return n;
}
// Fractional working days used for "average decision time"
export function workingHoursBetween(from, to) {
  let ms = 0;
  const a = new Date(from).getTime(), b = new Date(to).getTime();
  for (let t = a; t < b; t += 3600000) if (isWorkingDay(new Date(t))) ms += Math.min(3600000, b - t);
  return ms / 3600000;
}
export function slaState(app) {
  if (!app.sla_due_at || app.first_decision_at) return null;
  if (app.status === 'info_requested') return 'paused';
  const due = app.sla_due_at.slice(0, 10);
  const t = today();
  if (t > due) return 'overdue';
  if (t === due) return 'due_today';
  return 'on_time';
}

/* ---------------- Geometry (mock map service helpers) ---------------- */
export function haversineKm(a, b) {
  const R = 6371, toR = (x) => (x * Math.PI) / 180;
  const dLat = toR(b.lat - a.lat), dLng = toR(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function inRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export function pointInGeometry(lat, lng, geom) {
  if (!geom) return false;
  if (geom.type === 'Feature') return pointInGeometry(lat, lng, geom.geometry);
  if (geom.type === 'FeatureCollection') return geom.features.some((f) => pointInGeometry(lat, lng, f));
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
  return polys.some((p) => inRing(lng, lat, p[0]) && !p.slice(1).some((hole) => inRing(lng, lat, hole)));
}

/* ---------------- Lists (AD-03) ---------------- */
export const list = (type) => all('SELECT * FROM lists WHERE list_type = ? AND active = 1 ORDER BY sort, id', type);
export const listLabel = (type, code) => get('SELECT label_en, label_ar FROM lists WHERE list_type = ? AND code = ?', type, code);

/* ---------------- Audit log (SB-09 / TR-04) ---------------- */
export function audit(user, action, entity, entityId, prev, next, reason) {
  insert('audit_log', {
    at: nowIso(),
    user_id: user?.id ?? null,
    user_name: user ? user.name_en : 'System',
    role: user ? user.role : 'system',
    action,
    entity,
    entity_id: entityId == null ? null : String(entityId),
    prev_value: prev === undefined ? null : JSON.stringify(prev),
    new_value: next === undefined ? null : JSON.stringify(next),
    reason: reason ?? null,
  });
}

export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message || code);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
