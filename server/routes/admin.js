// Ministry administration (sections 4.3 and 4.6). Every change is written to the audit log.
import { Router } from 'express';
import { all, get, insert, update, run, parse } from '../db/index.js';
import { AppError, audit, setting, putSetting, nowIso, admissionAY, clearCaches, GRADES } from '../services/core.js';
import { setGradeConfig, sectionSeats, checkAlerts, schoolGrades } from '../services/capacity.js';
import * as A from '../services/applications.js';
import { requireRole, wrap } from './common.js';
import { exportXlsx } from '../services/excel.js';

const r = Router();
const ADMIN = requireRole('ministry_admin');
const READ = requireRole('ministry_admin', 'ministry_viewer');

/* CC-01 / CC-02 / CC-08 capacity configuration */
r.get('/capacity', READ, wrap((req) => {
  const ay = req.query.ay || admissionAY().code;
  const schools = all('SELECT * FROM schools ORDER BY code').filter((s) => !req.query.school || s.id === Number(req.query.school));
  return schools.map((s) => ({
    ...s, grades: GRADES.map((g) => {
      const secs = sectionSeats(s.id, ay, g);
      return { grade: g, offered: secs.length > 0, sections: secs.length, max_students: secs[0]?.capacity || 0, seats: secs };
    }),
  }));
}));
r.put('/capacity', ADMIN, wrap((req) => {
  const b = req.body;
  if (!GRADES.includes(b.grade)) throw new AppError(400, 'bad_grade');
  if (b.offered && (!(b.sections >= 1) || !(b.maxStudents >= 1))) throw new AppError(400, 'bad_values');
  const res = setGradeConfig(req.user, { schoolId: Number(b.schoolId), ay: b.ay || admissionAY().code, grade: b.grade, sections: Number(b.sections), maxStudents: Number(b.maxStudents), offered: !!b.offered });
  A.sweepFull(Number(b.schoolId), b.ay || admissionAY().code, b.grade);
  return res;
}));

/* CC-06 force registration – the option only exists for admins holding the permission */
r.get('/force-candidates', ADMIN, wrap((req) => {
  if (!req.user.force_registration) throw new AppError(403, 'force_permission_required');
  return all(`SELECT a.id, a.ref, a.status, a.grade, c.full_name_en child_en, c.full_name_ar child_ar, s.name_en school_en, s.name_ar school_ar
                FROM applications a JOIN children c ON c.id = a.child_id LEFT JOIN schools s ON s.id = a.current_school_id
               WHERE a.ay = ? AND a.grade = ? AND a.status IN ('submitted','under_review','passed','escalated','info_requested') ORDER BY a.status = 'escalated' DESC, a.submitted_at LIMIT 100`,
  req.query.ay || admissionAY().code, req.query.grade);
}));
r.post('/force-register', ADMIN, wrap((req) => A.appView(A.forceRegister(req.user, { appId: Number(req.body.appId), sectionId: Number(req.body.sectionId), reason: req.body.reason }))));

/* CC-03 catchments */
r.get('/catchments', wrap(() => all('SELECT c.school_id, c.geojson, c.updated_at, s.code, s.name_en, s.name_ar, s.lat, s.lng FROM catchments c JOIN schools s ON s.id = c.school_id ORDER BY s.code').map((c) => ({ ...c, geojson: parse(c.geojson) }))));
r.put('/catchments/:schoolId', ADMIN, wrap((req) => {
  let g = req.body.geojson;
  if (typeof g === 'string') g = JSON.parse(g);
  if (g?.type === 'FeatureCollection') g = g.features.length === 1 ? g.features[0].geometry : { type: 'MultiPolygon', coordinates: g.features.flatMap((f) => (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates)) };
  if (g?.type === 'Feature') g = g.geometry;
  if (!g || !['Polygon', 'MultiPolygon'].includes(g.type)) throw new AppError(400, 'bad_geojson', 'A Polygon or MultiPolygon is required');
  const prev = get('SELECT geojson FROM catchments WHERE school_id = ?', req.params.schoolId);
  run(`INSERT INTO catchments (school_id, geojson, updated_at) VALUES (?, ?, ?) ON CONFLICT(school_id) DO UPDATE SET geojson = excluded.geojson, updated_at = excluded.updated_at`, Number(req.params.schoolId), JSON.stringify(g), nowIso());
  audit(req.user, 'catchment.updated', 'school', req.params.schoolId, parse(prev?.geojson), g, req.body.reason);
  return { ok: true };
}));

/* AD-02 rules / settings */
r.get('/settings', READ, wrap(() => all('SELECT * FROM settings ORDER BY key').map((s) => ({ ...s, value: parse(s.value) }))));
r.put('/settings/:key', ADMIN, wrap((req) => {
  const prev = setting(req.params.key);
  if (prev === null && !get('SELECT 1 FROM settings WHERE key = ?', req.params.key)) throw new AppError(404, 'unknown_setting');
  putSetting(req.params.key, req.body.value);
  audit(req.user, 'setting.changed', 'setting', req.params.key, prev, req.body.value, req.body.reason);
  if (req.params.key === 'capacity_warning_threshold') for (const s of all('SELECT id FROM schools')) for (const g of schoolGrades(s.id, admissionAY().code)) checkAlerts(s.id, admissionAY().code, g);
  return { ok: true };
}));

/* AD-01 academic years & windows */
r.get('/windows', READ, wrap(() => ({ years: all('SELECT * FROM academic_years ORDER BY code'), windows: all('SELECT * FROM windows ORDER BY ay, type') })));
r.put('/windows/:id', ADMIN, wrap((req) => {
  const w = get('SELECT * FROM windows WHERE id = ?', req.params.id);
  if (!w) throw new AppError(404, 'not_found');
  if (req.body.open_date > req.body.close_date) throw new AppError(400, 'bad_dates');
  update('windows', w.id, { open_date: req.body.open_date, close_date: req.body.close_date });
  audit(req.user, 'window.changed', 'window', `${w.ay}:${w.type}`, { open: w.open_date, close: w.close_date }, { open: req.body.open_date, close: req.body.close_date });
  return { ok: true };
}));

/* AD-03 lists */
r.get('/lists', READ, wrap(() => all('SELECT * FROM lists ORDER BY list_type, sort, id')));
r.post('/lists', ADMIN, wrap((req) => {
  const b = req.body;
  if (!b.list_type || !b.code || !b.label_en || !b.label_ar) throw new AppError(400, 'missing_fields');
  const id = insert('lists', { list_type: b.list_type, code: b.code, parent_code: b.parent_code || null, label_en: b.label_en, label_ar: b.label_ar, sort: b.sort ?? 99, active: 1 });
  audit(req.user, 'list.item_added', 'list', `${b.list_type}:${b.code}`, null, b);
  // a new document type can be added to the pathway matrix at the same time
  if (b.list_type === 'doc_type' && b.matrix) {
    const m = setting('doc_matrix');
    putSetting('doc_matrix', { ...m, [b.code]: b.matrix });
    audit(req.user, 'setting.changed', 'setting', 'doc_matrix', m[b.code] || null, b.matrix);
  }
  return get('SELECT * FROM lists WHERE id = ?', id);
}));
r.put('/lists/:id', ADMIN, wrap((req) => {
  const it = get('SELECT * FROM lists WHERE id = ?', req.params.id);
  if (!it) throw new AppError(404, 'not_found');
  const patch = { label_en: req.body.label_en ?? it.label_en, label_ar: req.body.label_ar ?? it.label_ar, active: req.body.active === undefined ? it.active : req.body.active ? 1 : 0, sort: req.body.sort ?? it.sort };
  update('lists', it.id, patch);
  audit(req.user, 'list.item_changed', 'list', `${it.list_type}:${it.code}`, it, patch);
  return { ok: true };
}));

/* AD-04 holidays */
r.get('/holidays', READ, wrap(() => all('SELECT * FROM holidays ORDER BY date')));
r.post('/holidays', ADMIN, wrap((req) => {
  insert('holidays', { date: req.body.date, name_en: req.body.name_en, name_ar: req.body.name_ar });
  clearCaches();
  audit(req.user, 'holiday.added', 'holiday', req.body.date, null, req.body);
  return { ok: true };
}));
r.delete('/holidays/:date', ADMIN, wrap((req) => {
  const h = get('SELECT * FROM holidays WHERE date = ?', req.params.date);
  run('DELETE FROM holidays WHERE date = ?', req.params.date);
  clearCaches();
  audit(req.user, 'holiday.removed', 'holiday', req.params.date, h, null);
  return { ok: true };
}));

/* AD-05 templates */
r.get('/templates', READ, wrap(() => all('SELECT * FROM templates ORDER BY key')));
r.put('/templates/:key', ADMIN, wrap((req) => {
  const t = get('SELECT * FROM templates WHERE key = ?', req.params.key);
  if (!t) throw new AppError(404, 'not_found');
  const patch = { subject_en: req.body.subject_en, subject_ar: req.body.subject_ar, body_en: req.body.body_en, body_ar: req.body.body_ar };
  update('templates', t.key, patch, 'key');
  audit(req.user, 'template.changed', 'template', t.key, t, patch);
  return { ok: true };
}));

/* AD-06 users, roles and the force-registration permission */
r.get('/users', READ, wrap(() => all(`SELECT u.id, u.role, u.name_en, u.name_ar, u.email, u.school_id, u.cluster_id, u.force_registration, u.active, s.name_en school_en, s.name_ar school_ar
                                       FROM users u LEFT JOIN schools s ON s.id = u.school_id WHERE u.role != 'parent' ORDER BY u.role, s.code, u.name_en`)));
r.put('/users/:id', ADMIN, wrap((req) => {
  const u = get('SELECT * FROM users WHERE id = ?', req.params.id);
  if (!u || u.role === 'parent') throw new AppError(404, 'not_found');
  const b = req.body;
  const role = b.role ?? u.role;
  const patch = {
    role, school_id: ['registrar', 'principal'].includes(role) ? Number(b.school_id ?? u.school_id) || null : null,
    cluster_id: role === 'cluster_officer' ? Number(b.cluster_id ?? u.cluster_id) || 1 : null,
    force_registration: role === 'ministry_admin' && (b.force_registration ?? u.force_registration) ? 1 : 0, active: b.active === undefined ? u.active : b.active ? 1 : 0,
  };
  update('users', u.id, patch);
  audit(req.user, patch.force_registration !== u.force_registration ? 'user.force_permission_changed' : 'user.role_changed', 'user', u.id,
    { role: u.role, school_id: u.school_id, force_registration: u.force_registration, active: u.active }, patch);
  return { ok: true };
}));
r.post('/users', ADMIN, wrap((req) => {
  const b = req.body;
  if (!b.name_en || !b.role) throw new AppError(400, 'missing_fields');
  const id = insert('users', { role: b.role, name_en: b.name_en, name_ar: b.name_ar || b.name_en, email: b.email, school_id: b.school_id || null, cluster_id: b.role === 'cluster_officer' ? 1 : null, force_registration: b.force_registration ? 1 : 0, created_at: nowIso() });
  audit(req.user, 'user.created', 'user', id, null, b);
  return { id };
}));

/* TR-07 translation overrides */
r.get('/translations', READ, wrap(() => all('SELECT * FROM translations ORDER BY key, lang')));
r.put('/translations', ADMIN, wrap((req) => {
  const { key, lang, value } = req.body;
  if (!key || !['en', 'ar'].includes(lang)) throw new AppError(400, 'bad_request');
  const prev = get('SELECT value FROM translations WHERE key = ? AND lang = ?', key, lang);
  if (value === null || value === '') run('DELETE FROM translations WHERE key = ? AND lang = ?', key, lang);
  else run(`INSERT INTO translations (lang, key, value) VALUES (?, ?, ?) ON CONFLICT(lang, key) DO UPDATE SET value = excluded.value`, lang, key, value);
  audit(req.user, 'translation.changed', 'translation', `${lang}:${key}`, prev?.value ?? null, value);
  return { ok: true };
}));

/* SB-09 / TR-04 audit log */
function auditQuery(q) {
  const w = ['1=1'], p = [];
  if (q.from) { w.push('date(at) >= ?'); p.push(q.from); }
  if (q.to) { w.push('date(at) <= ?'); p.push(q.to); }
  if (q.action) { w.push('action LIKE ?'); p.push(`%${q.action}%`); }
  if (q.user) { w.push('user_name LIKE ?'); p.push(`%${q.user}%`); }
  if (q.entity) { w.push('(entity LIKE ? OR entity_id LIKE ?)'); p.push(`%${q.entity}%`, `%${q.entity}%`); }
  return all(`SELECT * FROM audit_log WHERE ${w.join(' AND ')} ORDER BY id DESC LIMIT ${q.limit ? Math.min(Number(q.limit), 20000) : 500}`, ...p);
}
r.get('/audit', READ, wrap((req) => auditQuery(req.query)));
r.get('/audit/export', READ, wrap(async (req, res) => {
  const rows = auditQuery({ ...req.query, limit: 20000 });
  await exportXlsx(res, { name: 'audit-log', lang: req.query.lang, columns: ['at', 'user_name', 'role', 'action', 'entity', 'entity_id', 'prev_value', 'new_value', 'reason'], rows, titleKey: 'nav.audit' });
}));

/* Demo controls: run scheduled jobs and move the demo clock */
r.post('/jobs/run', ADMIN, wrap((req) => {
  const res = A.runJobs();
  audit(req.user, 'jobs.run', 'system', null, null, res);
  return res;
}));
r.put('/clock', ADMIN, wrap((req) => {
  const prev = setting('demo_clock_offset_days', 0);
  putSetting('demo_clock_offset_days', Number(req.body.offsetDays) || 0);
  audit(req.user, 'demo.clock_changed', 'setting', 'demo_clock_offset_days', prev, Number(req.body.offsetDays) || 0);
  return { ok: true, jobs: A.runJobs() };
}));

export default r;
