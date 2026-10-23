// School & cluster back office (section 4.2) plus shared application/document access.
import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { all, get, parse, UPLOAD_DIR } from '../db/index.js';
import { AppError, admissionAY, currentAY, CYCLES, GRADES, slaState, setting, today } from '../services/core.js';
import * as A from '../services/applications.js';
import { schoolSummary, sectionSeats } from '../services/capacity.js';
import { requireAuth, requireRole, canSeeApp, wrap } from './common.js';

const r = Router();
r.use(requireAuth);

const SCHOOL = ['registrar', 'principal'];
const BACK = ['registrar', 'principal', 'cluster_officer', 'ministry_admin', 'ministry_viewer'];

/* SB-01 application queue */
r.get('/queue', requireRole(...BACK), wrap((req) => {
  const u = req.user, q = req.query;
  const w = ['a.status != ?'], p = ['draft'];
  if (SCHOOL.includes(u.role)) { w.push('a.current_school_id = ?'); p.push(u.school_id); }
  else if (u.role === 'cluster_officer') { w.push('s.cluster_id = ?'); p.push(u.cluster_id); }
  if (q.school) { w.push('a.current_school_id = ?'); p.push(Number(q.school)); }
  w.push('a.ay = ?'); p.push(q.ay || admissionAY().code);
  if (q.grade) { w.push('a.grade = ?'); p.push(q.grade); }
  if (q.cycle && CYCLES[q.cycle]) { w.push(`a.grade IN (${CYCLES[q.cycle].map(() => '?').join(',')})`); p.push(...CYCLES[q.cycle]); }
  if (q.pathway) { w.push('a.pathway = ?'); p.push(q.pathway); }
  if (q.status) { const st = String(q.status).split(','); w.push(`a.status IN (${st.map(() => '?').join(',')})`); p.push(...st); }
  else if (q.view !== 'all') { w.push(`a.status IN ('submitted','under_review','info_requested','passed','escalated','offer_made')`); }
  if (q.type) { w.push('a.type = ?'); p.push(q.type); }
  else w.push(`a.type != 'renewal'`);
  if (q.q) { w.push('(a.ref LIKE ? OR c.full_name_en LIKE ? OR c.full_name_ar LIKE ? OR c.emirates_id LIKE ?)'); p.push(...Array(4).fill(`%${q.q}%`)); }
  const rows = all(
    `SELECT a.id, a.ref, a.status, a.type, a.pathway, a.grade, a.submitted_at, a.sla_due_at, a.first_decision_at, a.offer_due_at, a.info_due_at, a.escalation_reason,
            a.exceptional, a.out_of_catchment, a.residence_route, a.sibling_school_ids, a.current_school_id, a.pref_index, a.preferences, a.transport_mode, a.home_lat, a.home_lng, a.child_id,
            c.full_name_en child_en, c.full_name_ar child_ar, c.gender, c.nationality, c.sod, s.name_en school_en, s.name_ar school_ar, s.code school_code
       FROM applications a JOIN children c ON c.id = a.child_id LEFT JOIN schools s ON s.id = a.current_school_id
      WHERE ${w.join(' AND ')} ORDER BY a.submitted_at LIMIT 2000`, ...p
  ).map((a) => ({ ...a, sla: slaState(a), cycle: Object.keys(CYCLES).find((k) => CYCLES[k].includes(a.grade)), sibling_here: parse(a.sibling_school_ids, []).includes(a.current_school_id), key: A.priorityKey(a) }));
  // BR-05: rank applications competing for the same school and grade
  const groups = {};
  for (const a of rows) (groups[`${a.current_school_id}:${a.grade}`] ||= []).push(a);
  for (const g of Object.values(groups)) g.filter((a) => ['submitted', 'under_review', 'passed'].includes(a.status)).sort(A.comparePriority).forEach((a, i) => (a.priority_rank = i + 1));
  const filtered = q.sla ? rows.filter((a) => a.sla === q.sla) : rows;
  const counts = { total: rows.length, on_time: 0, due_today: 0, overdue: 0, paused: 0 };
  for (const a of rows) if (a.sla) counts[a.sla]++;
  return { rows: filtered.map(({ key, preferences, sibling_school_ids, ...a }) => a), counts, priority_order: setting('priority_order') };
}));

/* SB-02 application view (shared by parents through /family, and staff here) */
r.get('/applications/:id', requireRole(...BACK, 'transport'), wrap((req) => {
  let app = A.getApp(Number(req.params.id));
  if (!canSeeApp(req.user, app)) throw new AppError(403, 'forbidden');
  app = A.openForReview(req.user, app.id);
  const family = app.family_id ? get('SELECT * FROM families WHERE id = ?', app.family_id) : null;
  const guardians = app.family_id ? all(`SELECT * FROM guardians WHERE family_id = ? AND status = 'active' ORDER BY is_primary DESC`, app.family_id) : [];
  const siblings = app.family_id ? all(`SELECT c.id, c.full_name_en, c.full_name_ar, e.grade, e.status, s.name_en school_en, s.name_ar school_ar, e.school_id
       FROM children c LEFT JOIN enrolments e ON e.child_id = c.id AND e.ay = ? AND e.status IN ('enrolled','leaving') LEFT JOIN schools s ON s.id = e.school_id
      WHERE c.family_id = ? AND c.id != ?`, currentAY().code, app.family_id, app.child_id) : [];
  const docs = app.family_id
    ? all(`SELECT * FROM documents WHERE family_id = ? AND (child_id IS NULL OR child_id = ?) ORDER BY doc_type, uploaded_at DESC`, app.family_id, app.child_id)
    : [];
  const seats = app.current_school_id ? sectionSeats(app.current_school_id, app.ay, app.grade) : [];
  const key = A.priorityKey(app);
  return {
    app: A.appView(app), family, guardians, siblings, documents: docs, checklist: app.family_id ? A.checklist(app) : [], timeline: A.timeline(app.id), seats,
    priority: { order: setting('priority_order'), key },
    can: {
      decide: (SCHOOL.includes(req.user.role) && app.current_school_id === req.user.school_id && ['submitted', 'under_review', 'passed'].includes(app.status)),
      cluster: ['escalated', 'submitted', 'under_review', 'passed'].includes(app.status) && A.canDecideEscalation(req.user, app), // SB-07 / BR-14
      force: req.user.role === 'ministry_admin' && !!req.user.force_registration && A.OPEN.includes(app.status) && app.status !== 'offer_made',
    },
  };
}));

r.post('/applications/:id/request-info', requireRole(...SCHOOL), wrap((req) => A.appView(A.requestInfo(req.user, Number(req.params.id), req.body))));
r.post('/applications/:id/offer', requireRole(...SCHOOL, 'cluster_officer'), wrap((req) => A.appView(A.offer(req.user, Number(req.params.id), { sectionId: req.body.sectionId }))));
r.post('/applications/:id/pass', requireRole(...SCHOOL), wrap((req) => A.appView(A.passNext(req.user, Number(req.params.id), { note: req.body.note }))));
r.post('/applications/:id/escalate', requireRole(...SCHOOL), wrap((req) => A.appView(A.escalate(req.user, Number(req.params.id), req.body))));
r.post('/applications/:id/reject', requireRole(...SCHOOL, 'cluster_officer', 'ministry_admin'), wrap((req) => A.appView(A.reject(req.user, Number(req.params.id), req.body))));
r.post('/applications/:id/cluster-approve', requireRole('cluster_officer', 'ministry_admin'), wrap((req) => A.appView(A.clusterApprove(req.user, Number(req.params.id), req.body))));
r.post('/applications/:id/cluster-place', requireRole('cluster_officer', 'ministry_admin'), wrap((req) => A.appView(A.clusterPlace(req.user, Number(req.params.id), req.body))));

/* SB-03 document decisions */
r.post('/documents/:id/decision', requireRole(...SCHOOL), wrap((req) => {
  const d = get('SELECT * FROM documents WHERE id = ?', req.params.id);
  const app = d && get(`SELECT * FROM applications WHERE family_id = ? AND current_school_id = ? LIMIT 1`, d.family_id, req.user.school_id);
  if (!app) throw new AppError(403, 'forbidden');
  return A.docDecision(req.user, Number(req.params.id), req.body);
}));

// Document file stream – parents see their own; staff see documents of families with an application they can see
r.get('/documents/:id/file', wrap((req, res) => {
  const d = get('SELECT * FROM documents WHERE id = ?', req.params.id);
  if (!d) throw new AppError(404, 'not_found');
  const u = req.user;
  let ok = false;
  if (u.role === 'parent') ok = d.family_id === req.familyId;
  else ok = all('SELECT * FROM applications WHERE family_id = ?', d.family_id).some((a) => canSeeApp(u, a));
  if (!ok) throw new AppError(403, 'forbidden');
  const file = path.join(UPLOAD_DIR, path.basename(d.storage_path));
  if (!fs.existsSync(file)) throw new AppError(404, 'file_missing');
  res.setHeader('Content-Type', d.mime);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(d.filename)}"`);
  fs.createReadStream(file).pipe(res);
}));

/* Capacity view for a school (principal / registrar: own school only) */
r.get('/schools/:id/capacity', requireRole(...BACK), wrap((req) => {
  const id = Number(req.params.id);
  if (SCHOOL.includes(req.user.role) && id !== req.user.school_id) throw new AppError(403, 'not_your_school');
  const ay = req.query.ay || admissionAY().code;
  const s = get('SELECT * FROM schools WHERE id = ?', id);
  return { school: s, ay, ...schoolSummary(id, ay), alerts: all(`SELECT * FROM capacity_alerts WHERE school_id = ? AND ay = ? AND cleared_at IS NULL ORDER BY level DESC`, id, ay), can_force: req.user.role === 'ministry_admin' && !!req.user.force_registration };
}));

/* SB-08 leavers */
r.get('/leavers', requireRole(...BACK), wrap((req) => {
  const u = req.user, w = ['e.ay = ?'], p = [currentAY().code];
  if (SCHOOL.includes(u.role)) { w.push('e.school_id = ?'); p.push(u.school_id); }
  if (u.role === 'cluster_officer') { w.push('s.cluster_id = ?'); p.push(u.cluster_id); }
  const view = req.query.view || 'requests';
  if (view === 'requests') w.push(`e.status = 'enrolled' AND e.leave_requested_at IS NOT NULL`);
  else if (view === 'leaving') w.push(`e.status = 'leaving'`);
  else w.push(`e.status = 'left' AND e.leave_reason NOT IN ('transfer_out','graduated')`);
  return all(`SELECT e.*, c.full_name_en child_en, c.full_name_ar child_ar, c.emirates_id, c.gender, s.name_en school_en, s.name_ar school_ar, sec.name section
                FROM enrolments e JOIN children c ON c.id = e.child_id JOIN schools s ON s.id = e.school_id LEFT JOIN sections sec ON sec.id = e.section_id
               WHERE ${w.join(' AND ')} ORDER BY COALESCE(e.leave_date, e.leave_requested_at) DESC LIMIT 500`, ...p);
}));
r.get('/students', requireRole(...SCHOOL), wrap((req) => {
  const q = `%${req.query.q || ''}%`;
  return all(`SELECT e.id enrolment_id, e.grade, sec.name section, c.full_name_en, c.full_name_ar, c.emirates_id FROM enrolments e JOIN children c ON c.id = e.child_id LEFT JOIN sections sec ON sec.id = e.section_id
               WHERE e.school_id = ? AND e.ay = ? AND e.status = 'enrolled' AND (c.full_name_en LIKE ? OR c.full_name_ar LIKE ? OR c.emirates_id LIKE ?) ORDER BY c.full_name_en LIMIT 20`, req.user.school_id, currentAY().code, q, q, q);
}));
/* Student directory (addition to SB-01..SB-09): students enrolled this year, with their next-year status.
 * Scope: school staff see their own school, cluster officers their cluster, Ministry users every school. */
const DIRECTORY = ['registrar', 'principal', 'cluster_officer', 'ministry_admin', 'ministry_viewer'];
function directoryScope(user, w, p) {
  if (SCHOOL.includes(user.role)) { w.push('e.school_id = ?'); p.push(user.school_id); }
  if (user.role === 'cluster_officer') { w.push('s.cluster_id = ?'); p.push(user.cluster_id); }
}
// What happens to the student next year: renewed, awaiting renewal, leaving, transferring, not returning, moving on, graduating
function nextYearStatus(row) {
  if (row.status === 'leaving' || row.leave_requested_at) return 'leaving';
  if (row.next_status === 'enrolled') return row.next_school_id === row.school_id ? 'renewed' : 'transferring';
  if (row.next_status === 'pending_renewal') return 'awaiting';
  if (row.next_status === 'left') return 'not_returning';
  return row.grade === 'G12' ? 'graduating' : 'moving_on';
}
const STUDENT_FROM = `FROM enrolments e JOIN children c ON c.id = e.child_id JOIN schools s ON s.id = e.school_id LEFT JOIN sections sec ON sec.id = e.section_id
  LEFT JOIN enrolments n ON n.id = (SELECT MAX(id) FROM enrolments x WHERE x.child_id = e.child_id AND x.ay = ?)`;

r.get('/school/students', requireRole(...DIRECTORY), wrap((req) => {
  const q = req.query, cur = currentAY().code, next = admissionAY().code;
  const w = ['e.ay = ?', `e.status IN ('enrolled','leaving')`], p = [next, cur];
  directoryScope(req.user, w, p);
  if (q.school) { w.push('e.school_id = ?'); p.push(Number(q.school)); }
  if (q.grade) { w.push('e.grade = ?'); p.push(q.grade); }
  if (q.section) { w.push('sec.name = ?'); p.push(q.section); }
  if (q.q) { w.push('(c.full_name_en LIKE ? OR c.full_name_ar LIKE ? OR c.emirates_id LIKE ?)'); p.push(...Array(3).fill(`%${q.q.trim()}%`)); }
  const rows = all(`SELECT c.id, c.full_name_en, c.full_name_ar, c.emirates_id, c.gender, c.nationality, c.sod, c.family_id,
                           e.id enrolment_id, e.school_id, e.grade, e.status, e.leave_requested_at, e.leave_date, sec.name section, s.name_en school_en, s.name_ar school_ar,
                           n.status next_status, n.grade next_grade, n.school_id next_school_id
                      ${STUDENT_FROM} WHERE ${w.join(' AND ')}`, ...p)
    .map((r) => ({ ...r, next_year: nextYearStatus(r) }));
  // Students joining next year: accepted at the school for next year without being enrolled there this year
  // (new registrations and transfers in). Their grade and section are next year's.
  const wj = ['n.ay = ?', `n.status = 'enrolled'`, `NOT EXISTS (SELECT 1 FROM enrolments x WHERE x.child_id = n.child_id AND x.ay = ? AND x.school_id = n.school_id AND x.status IN ('enrolled','leaving'))`], pj = [next, cur];
  if (SCHOOL.includes(req.user.role)) { wj.push('n.school_id = ?'); pj.push(req.user.school_id); }
  if (req.user.role === 'cluster_officer') { wj.push('s.cluster_id = ?'); pj.push(req.user.cluster_id); }
  if (q.school) { wj.push('n.school_id = ?'); pj.push(Number(q.school)); }
  if (q.grade) { wj.push('n.grade = ?'); pj.push(q.grade); }
  if (q.section) { wj.push('sec.name = ?'); pj.push(q.section); }
  if (q.q) { wj.push('(c.full_name_en LIKE ? OR c.full_name_ar LIKE ? OR c.emirates_id LIKE ?)'); pj.push(...Array(3).fill(`%${q.q.trim()}%`)); }
  const joining = all(`SELECT c.id, c.full_name_en, c.full_name_ar, c.emirates_id, c.gender, c.nationality, c.sod, c.family_id,
                              n.id enrolment_id, n.school_id, n.grade, n.status, n.source, sec.name section, s.name_en school_en, s.name_ar school_ar
                         FROM enrolments n JOIN children c ON c.id = n.child_id JOIN schools s ON s.id = n.school_id LEFT JOIN sections sec ON sec.id = n.section_id
                        WHERE ${wj.join(' AND ')}`, ...pj).map((r) => ({ ...r, next_year: 'joining', joining_ay: next }));
  rows.push(...joining);
  rows
    // KG1, KG2, Grade 1 … Grade 12 (not alphabetical), then section and name
    .sort((a, b) => GRADES.indexOf(a.grade) - GRADES.indexOf(b.grade) || String(a.section).localeCompare(String(b.section)) || a.full_name_en.localeCompare(b.full_name_en));
  const counts = {};
  for (const r of rows) counts[r.next_year] = (counts[r.next_year] || 0) + 1;
  const filtered = q.next ? rows.filter((r) => r.next_year === q.next) : rows;
  const limit = 300;
  return { total: filtered.length, all: rows.length, enrolled: rows.length - joining.length, joining: joining.length, counts, rows: filtered.slice(0, limit), limited: filtered.length > limit, current_ay: cur, next_ay: next };
}));

r.get('/school/students/:childId', requireRole(...DIRECTORY), wrap((req) => {
  const id = Number(req.params.childId);
  const child = get('SELECT * FROM children WHERE id = ?', id);
  if (!child) throw new AppError(404, 'not_found');
  const enrolments = all(`SELECT e.*, s.name_en school_en, s.name_ar school_ar, s.cluster_id, sec.name section FROM enrolments e JOIN schools s ON s.id = e.school_id
                           LEFT JOIN sections sec ON sec.id = e.section_id WHERE e.child_id = ? ORDER BY e.ay DESC, e.id DESC`, id);
  const apps = all(`SELECT a.id, a.ref, a.type, a.pathway, a.ay, a.grade, a.status, a.submitted_at, a.preferences, a.current_school_id, s.name_en school_en, s.name_ar school_ar, s.cluster_id
                      FROM applications a LEFT JOIN schools s ON s.id = a.current_school_id WHERE a.child_id = ? AND a.status != 'draft' ORDER BY a.id DESC`, id);
  // TR-02: school staff only for students placed at, or applying to, their school; cluster officers within their cluster
  const u = req.user;
  const ok = SCHOOL.includes(u.role)
    ? enrolments.some((e) => e.school_id === u.school_id) || apps.some((a) => a.current_school_id === u.school_id || parse(a.preferences, []).includes(u.school_id))
    : u.role === 'cluster_officer' ? enrolments.some((e) => e.cluster_id === u.cluster_id) || apps.some((a) => a.cluster_id === u.cluster_id) : true;
  if (!ok) throw new AppError(403, 'not_your_school');
  const cur = currentAY().code, next = admissionAY().code;
  const current = enrolments.find((e) => e.ay === cur && ['enrolled', 'leaving', 'left'].includes(e.status)) || null;
  const nextE = enrolments.find((e) => e.ay === next) || null;
  const family = child.family_id ? get('SELECT * FROM families WHERE id = ?', child.family_id) : null;
  const guardians = child.family_id ? all(`SELECT id, full_name_en, full_name_ar, emirates_id, relationship, mobile, email, nationality, is_primary, status, preferred_channel FROM guardians WHERE family_id = ? ORDER BY is_primary DESC, id`, child.family_id) : [];
  const siblings = child.family_id ? all(`SELECT c.id, c.full_name_en, c.full_name_ar, e.grade, s.name_en school_en, s.name_ar school_ar FROM children c
      LEFT JOIN enrolments e ON e.child_id = c.id AND e.ay = ? AND e.status IN ('enrolled','leaving') LEFT JOIN schools s ON s.id = e.school_id
      WHERE c.family_id = ? AND c.id != ?`, cur, child.family_id, id) : [];
  let next_year = current ? nextYearStatus({ ...current, next_status: nextE?.status, next_school_id: nextE?.school_id }) : nextE?.status === 'enrolled' ? 'joining' : null;
  // for the receiving school, a transfer in is a student joining next year
  if (SCHOOL.includes(u.role) && nextE?.status === 'enrolled' && nextE.school_id === u.school_id && current?.school_id !== u.school_id) next_year = 'joining';
  return {
    child, current, next: nextE, next_year, family, guardians, siblings, current_ay: cur, next_ay: next,
    history: enrolments, applications: apps.map(({ preferences, ...a }) => a),
  };
}));

r.post('/leavers/:enrolmentId/confirm', requireRole(...SCHOOL), wrap((req) => A.confirmLeave(req.user, Number(req.params.enrolmentId), req.body)));

/* SB-07 cluster view */
r.get('/cluster/overview', requireRole('cluster_officer', 'ministry_admin', 'ministry_viewer'), wrap((req) => {
  const clusterId = req.user.cluster_id || Number(req.query.cluster) || get('SELECT id FROM clusters LIMIT 1').id;
  const ay = req.query.ay || admissionAY().code;
  const schools = all('SELECT * FROM schools WHERE cluster_id = ? ORDER BY code', clusterId).map((s) => ({ ...s, ...schoolSummary(s.id, ay) }));
  const escalated = all(`SELECT a.*, c.full_name_en child_en, c.full_name_ar child_ar, c.sod, c.nationality, s.name_en school_en, s.name_ar school_ar
                           FROM applications a JOIN children c ON c.id = a.child_id JOIN schools s ON s.id = a.current_school_id
                          WHERE a.status = 'escalated' AND s.cluster_id = ? ORDER BY a.submitted_at`, clusterId).map((a) => ({ ...a, preferences: parse(a.preferences, []) }));
  const overdue = all(`SELECT a.id, a.ref, a.grade, a.sla_due_at, a.status, s.name_en school_en, s.name_ar school_ar FROM applications a JOIN schools s ON s.id = a.current_school_id
                        WHERE s.cluster_id = ? AND a.first_decision_at IS NULL AND a.status IN ('submitted','under_review','passed') AND date(a.sla_due_at) < ? ORDER BY a.sla_due_at LIMIT 100`, clusterId, today());
  return { cluster: get('SELECT * FROM clusters WHERE id = ?', clusterId), ay, schools, escalated, overdue };
}));

export default r;
