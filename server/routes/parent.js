// Parent portal API (section 4.1). Every route is scoped to the signed-in guardian's family (TR-02).
import { Router } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { all, get, insert, update, parse, UPLOAD_DIR } from '../db/index.js';
import {
  AppError, nowIso, today, eligibleGrade, admissionAY, currentAY, windowStatus, setting, audit, nextGrade, cycleOf, isoDate,
} from '../services/core.js';
import { icp, sis, maps, transport } from '../mocks/index.js';
import * as A from '../services/applications.js';
import { notify } from '../services/notify.js';
import { requireRole, wrap } from './common.js';

const r = Router();
r.use(requireRole('parent'));

function familyOf(req) {
  if (!req.familyId) throw new AppError(409, 'no_family', 'No active family account');
  return get('SELECT * FROM families WHERE id = ?', req.familyId);
}
function ownChild(req, id) {
  const c = get('SELECT * FROM children WHERE id = ? AND family_id = ?', id, req.familyId);
  if (!c) throw new AppError(404, 'child_not_found');
  return c;
}
function ownApp(req, id) {
  const a = get('SELECT * FROM applications WHERE id = ? AND family_id = ?', id, req.familyId);
  if (!a) throw new AppError(404, 'not_found');
  return a;
}

function childSummary(c) {
  const ay = admissionAY().code, cur = currentAY().code;
  const enr = get(`SELECT e.*, s.name_en school_en, s.name_ar school_ar, sec.name section FROM enrolments e JOIN schools s ON s.id = e.school_id LEFT JOIN sections sec ON sec.id = e.section_id WHERE e.child_id = ? AND e.ay = ? AND e.status IN ('enrolled','leaving','left') ORDER BY e.id DESC LIMIT 1`, c.id, cur);
  const nxt = get(`SELECT e.*, s.name_en school_en, s.name_ar school_ar FROM enrolments e JOIN schools s ON s.id = e.school_id WHERE e.child_id = ? AND e.ay = ? AND e.status IN ('pending_renewal','enrolled') ORDER BY e.id DESC LIMIT 1`, c.id, ay);
  const apps = all(`SELECT a.id, a.ref, a.status, a.type, a.pathway, a.grade, a.ay, a.submitted_at, a.offer_due_at, a.info_due_at, a.exceptional, s.name_en school_en, s.name_ar school_ar
                      FROM applications a LEFT JOIN schools s ON s.id = a.current_school_id WHERE a.child_id = ? ORDER BY a.id DESC`, c.id);
  const active = apps.find((a) => A.ACTIVE.includes(a.status) && a.ay === ay);
  const elig = enr && enr.status !== 'left' ? { grade: nextGrade(enr.grade), cycle: cycleOf(nextGrade(enr.grade)), rule: 'BR-02' } : eligibleGrade({ dob: c.dob, lastCompletedGrade: c.last_completed_grade, pathway: c.last_completed_grade ? 'transfer' : 'new' });
  return {
    ...c, eligible: { ...elig, ay }, enrolment: enr || null, next_year: nxt || null, applications: apps, active_application: active || null,
    can_renew: !!nxt && nxt.status === 'pending_renewal' && !active && windowStatus(ay, 'renewal').open,
    can_apply: !active && !(nxt && nxt.status === 'enrolled') && !!elig.grade,
    can_leave: !!enr && enr.status === 'enrolled' && !enr.leave_requested_at,
  };
}

/* ---------------- family (PP-02, PP-03, PP-06, PP-08) ---------------- */
r.get('/', wrap((req) => {
  const f = familyOf(req);
  const guardians = all('SELECT * FROM guardians WHERE family_id = ? ORDER BY is_primary DESC, id', f.id);
  const children = all('SELECT * FROM children WHERE family_id = ? ORDER BY dob', f.id).map(childSummary);
  const ay = admissionAY().code;
  return {
    family: f, guardians, children, me: { guardianId: req.guardian.id, isPrimary: !!req.guardian.is_primary },
    windows: { new: windowStatus(ay, 'new'), renewal: windowStatus(ay, 'renewal'), transfer: windowStatus(ay, 'transfer') },
    admission_ay: ay, current_ay: currentAY().code,
    documents: all(`SELECT d.*, c.full_name_en child_en, c.full_name_ar child_ar FROM documents d LEFT JOIN children c ON c.id = d.child_id WHERE d.family_id = ? ORDER BY d.uploaded_at DESC`, f.id),
  };
}));

r.put('/home', wrap((req) => {
  const f = familyOf(req);
  const { lat, lng, confirmed } = req.body;
  if (typeof lat !== 'number' || typeof lng !== 'number') throw new AppError(400, 'bad_location');
  const loc = maps.reverseGeocode(lat, lng);
  if (!loc.covered) throw new AppError(400, 'outside_service_area', 'The pin is outside the pilot area');
  if (!confirmed) throw new AppError(400, 'confirm_primary_residence');
  const patch = { home_lat: lat, home_lng: lng, emirate: loc.emirate, area_en: loc.area_en, area_ar: loc.area_ar, makani: loc.makani, residence_confirmed: 1 };
  update('families', f.id, patch);
  audit(req.user, 'family.home_set', 'family', f.id, { lat: f.home_lat, lng: f.home_lng }, patch);
  return { ...loc, catchment_school_ids: maps.catchmentsContaining(lat, lng) };
}));

r.put('/details', wrap((req) => {
  const f = familyOf(req);
  const b = req.body;
  const patch = { emergency_name: b.emergency_name, emergency_relationship: b.emergency_relationship, emergency_mobile: b.emergency_mobile, sole_custody: b.sole_custody ? 1 : 0 };
  update('families', f.id, patch);
  audit(req.user, 'family.updated', 'family', f.id, null, patch);
  return { ok: true };
}));

// Editable guardian fields only – name, Emirates ID, mobile and email come from UAE PASS (PP-01)
r.put('/guardians/:id', wrap((req) => {
  const g = get('SELECT * FROM guardians WHERE id = ? AND family_id = ?', req.params.id, req.familyId);
  if (!g) throw new AppError(404, 'not_found');
  const b = req.body;
  const patch = { nationality: b.nationality, eid_expiry: b.eid_expiry, relationship: b.relationship, preferred_channel: b.preferred_channel };
  update('guardians', g.id, patch);
  audit(req.user, 'guardian.updated', 'guardian', g.id, { nationality: g.nationality, relationship: g.relationship, preferred_channel: g.preferred_channel }, patch);
  return { ok: true };
}));

// PP-02: add the second guardian by Emirates ID – pending until they confirm through UAE PASS
r.post('/guardians', wrap((req) => {
  const f = familyOf(req);
  if (!req.guardian.is_primary) throw new AppError(403, 'primary_only');
  const { emiratesId, relationship } = req.body;
  const v = icp.validate(emiratesId);
  if (!v.valid) throw new AppError(400, 'eid_invalid', 'Emirates ID not valid (identity service)');
  if (get('SELECT 1 FROM guardians WHERE family_id = ? AND emirates_id = ?', f.id, emiratesId)) throw new AppError(409, 'already_added');
  const id = insert('guardians', { family_id: f.id, is_primary: 0, status: 'pending', emirates_id: emiratesId, relationship, created_at: nowIso() });
  audit(req.user, 'guardian.invited', 'guardian', id, null, { emirates_id: emiratesId, relationship });
  const u = get('SELECT * FROM users WHERE emirates_id = ?', emiratesId);
  if (u) notify('guardian_invite', [u], { inviter: { en: req.user.name_en, ar: req.user.name_ar } });
  return { id, status: 'pending' };
}));

r.delete('/guardians/:id', wrap((req) => {
  if (!req.guardian.is_primary) throw new AppError(403, 'primary_only');
  const g = get(`SELECT * FROM guardians WHERE id = ? AND family_id = ? AND status = 'pending'`, req.params.id, req.familyId);
  if (!g) throw new AppError(404, 'not_found');
  all('DELETE FROM guardians WHERE id = ? RETURNING id', g.id);
  audit(req.user, 'guardian.invite_cancelled', 'guardian', g.id, g, null);
  return { ok: true };
}));

/* ---------------- children (PP-04, PP-05, PP-09, PP-20) ---------------- */
r.post('/children', wrap((req) => {
  const f = familyOf(req);
  const b = req.body;
  const v = icp.validate(b.emiratesId);
  if (!v.valid) throw new AppError(400, 'eid_invalid', 'Emirates ID could not be validated by the identity service');
  if (v.nationality !== 'AE' && !b.passportNo) throw new AppError(400, 'passport_required');
  let c = get('SELECT * FROM children WHERE emirates_id = ?', b.emiratesId);
  if (c && c.family_id && c.family_id !== f.id) throw new AppError(409, 'child_in_other_family');
  const data = {
    family_id: f.id, emirates_id: b.emiratesId, full_name_en: v.name_en, full_name_ar: v.name_ar, dob: v.dob, gender: v.gender, nationality: v.nationality,
    passport_no: v.nationality === 'AE' ? null : b.passportNo, schooling_status: b.schoolingStatus || 'none', last_completed_grade: b.lastCompletedGrade || null, sod: b.sod ? 1 : 0,
  };
  if (c) update('children', c.id, data);
  else c = { id: insert('children', { ...data, created_at: nowIso() }) };
  audit(req.user, 'child.saved', 'child', c.id, null, data);
  const child = get('SELECT * FROM children WHERE id = ?', c.id);
  return { child: childSummary(child), sis: sis.lookup(child.emirates_id), siblings: all('SELECT id, full_name_en, full_name_ar FROM children WHERE family_id = ? AND id != ?', f.id, c.id) };
}));

r.put('/children/:id', wrap((req) => {
  const c = ownChild(req, req.params.id);
  const b = req.body;
  const patch = { schooling_status: b.schoolingStatus, last_completed_grade: b.lastCompletedGrade || null, sod: b.sod ? 1 : 0, passport_no: c.nationality === 'AE' ? null : b.passportNo || c.passport_no };
  update('children', c.id, patch);
  audit(req.user, 'child.updated', 'child', c.id, { schooling_status: c.schooling_status, last_completed_grade: c.last_completed_grade, sod: c.sod }, patch);
  return childSummary(get('SELECT * FROM children WHERE id = ?', c.id));
}));

r.get('/children/:id/pathways', wrap((req) => {
  const c = ownChild(req, req.params.id);
  const s = sis.lookup(c.emirates_id);
  const ay = admissionAY().code;
  const transferWin = windowStatus(ay, 'transfer');
  return {
    sis: s,
    pathways: s.enrolled ? ['renewal', 'moe_transfer'] : ['new', 'private', 'other_emirate', 'abroad'],
    transfer_window: transferWin, new_window: windowStatus(ay, 'new'), renewal_window: windowStatus(ay, 'renewal'),
  };
}));

/* ---------------- school search (PP-10, PP-11) ---------------- */
r.get('/eligible-schools', wrap((req) => {
  const f = familyOf(req);
  const lat = Number(req.query.lat ?? f.home_lat), lng = Number(req.query.lng ?? f.home_lng);
  if (!lat || !lng) throw new AppError(409, 'home_not_set');
  return A.eligibleSchools({ lat, lng, grade: req.query.grade, familyId: f.id, childId: Number(req.query.childId) || null });
}));

r.get('/transport/nearest', wrap((req) => {
  const f = familyOf(req);
  return transport.nearestStop(f.home_lat, f.home_lng, Number(req.query.schoolId));
}));

/* ---------------- applications ---------------- */
r.post('/applications', wrap((req) => {
  const f = familyOf(req);
  const c = ownChild(req, req.body.childId);
  const ay = admissionAY().code;
  const pathway = req.body.pathway;
  if (!['new', 'private', 'other_emirate', 'abroad', 'moe_transfer'].includes(pathway)) throw new AppError(400, 'bad_pathway');
  const existing = get(`SELECT * FROM applications WHERE child_id = ? AND ay = ? AND status = 'draft'`, c.id, ay);
  if (existing) return A.appView(existing);
  A.assertOneActive(c.id, ay);
  const s = sis.lookup(c.emirates_id);
  let grade;
  if (s.enrolled) grade = nextGrade(s.grade);
  else grade = eligibleGrade({ dob: c.dob, lastCompletedGrade: c.last_completed_grade, pathway }).grade;
  if (!grade) throw new AppError(400, 'no_eligible_grade');
  const type = A.TYPE_OF[pathway];
  if (type === 'new' && !windowStatus(ay, 'new').open) throw new AppError(409, 'window_closed', 'The new registration window is closed');
  const pendingRenewal = get(`SELECT id FROM enrolments WHERE child_id = ? AND ay = ? AND status = 'pending_renewal'`, c.id, ay);
  const exceptional = type === 'transfer' && !windowStatus(ay, 'transfer').open && !req.body.fromRenewal;
  const id = insert('applications', {
    child_id: c.id, family_id: f.id, ay, type, pathway, grade, status: 'draft', preferences: '[]', home_lat: f.home_lat, home_lng: f.home_lng,
    exceptional: exceptional ? 1 : 0, renewal_of_enrolment_id: req.body.fromRenewal && pendingRenewal ? pendingRenewal.id : null,
    created_by: req.user.id, created_at: nowIso(), updated_at: nowIso(),
  });
  audit(req.user, 'application.draft_created', 'application', id, null, { childId: c.id, pathway, grade, exceptional });
  return A.appView(A.getApp(id));
}));

r.patch('/applications/:id', wrap((req) => {
  const app = ownApp(req, req.params.id);
  if (app.status !== 'draft') throw new AppError(409, 'not_draft');
  const f = familyOf(req);
  const b = req.body, patch = {};
  if (b.preferences) {
    const max = setting('max_preferences', 3);
    if (b.preferences.length > max) throw new AppError(400, 'too_many_preferences', `Maximum ${max} preferences (BR-04)`);
    const el = A.eligibleSchools({ lat: f.home_lat, lng: f.home_lng, grade: app.grade, familyId: f.id, childId: app.child_id });
    const allowed = new Set([...el.eligible.filter((s) => s.seat_status !== 'full').map((s) => s.id), ...el.alternatives.map((s) => s.id)]);
    for (const p of b.preferences) if (!allowed.has(Number(p))) throw new AppError(400, 'school_not_eligible', 'School not eligible or grade full (BR-03 / CC-04)');
    patch.preferences = b.preferences.map(Number);
    patch.current_school_id = Number(b.preferences[0]) || null;
    patch.home_lat = f.home_lat; patch.home_lng = f.home_lng;
  }
  if (b.transport_mode) {
    if (!['bus', 'dropoff', 'walk', 'private'].includes(b.transport_mode)) throw new AppError(400, 'bad_transport');
    patch.transport_mode = b.transport_mode;
    patch.bus_route_id = null; patch.bus_stop_id = null;
    if (b.transport_mode === 'bus') {
      const first = (patch.preferences || parse(app.preferences, []))[0];
      const ns = transport.nearestStop(f.home_lat, f.home_lng, first);
      if (!ns.served) throw new AppError(400, 'bus_not_available', 'No MoE bus serves this home for the first-preference school');
      patch.bus_route_id = ns.route_id; patch.bus_stop_id = ns.stop_id;
    }
  }
  if (b.residence_route) patch.residence_route = ['own', 'relatives', 'employer'].includes(b.residence_route) ? b.residence_route : 'own';
  if (b.exceptional_reason !== undefined) patch.exceptional_reason = b.exceptional_reason;
  if (b.declarations !== undefined) patch.declarations = b.declarations ? 1 : 0;
  update('applications', app.id, { ...patch, updated_at: nowIso() });
  return A.appView(A.getApp(app.id));
}));

r.get('/applications/:id', wrap((req) => {
  const app = ownApp(req, req.params.id);
  return { app: A.appView(app), checklist: A.checklist(app), timeline: A.timeline(app.id), documents: all('SELECT * FROM documents WHERE application_id = ?', app.id), isPrimary: !!req.guardian.is_primary };
}));

r.post('/applications/:id/submit', wrap((req) => { ownApp(req, req.params.id); return A.appView(A.submit(req.user, Number(req.params.id))); }));
r.post('/applications/:id/accept', wrap((req) => { ownApp(req, req.params.id); return A.appView(A.accept(req.user, Number(req.params.id))); }));
r.post('/applications/:id/decline', wrap((req) => { ownApp(req, req.params.id); return A.appView(A.decline(req.user, Number(req.params.id), req.body)); }));
r.post('/applications/:id/respond', wrap((req) => { ownApp(req, req.params.id); return A.appView(A.respondInfo(req.user, Number(req.params.id), req.body)); }));
r.post('/applications/:id/withdraw', wrap((req) => {
  ownApp(req, req.params.id);
  // PP-02 / roles: the second guardian cannot withdraw an application
  if (!req.guardian.is_primary) throw new AppError(403, 'second_guardian_cannot_withdraw', 'Only the first guardian can withdraw an application');
  return A.appView(A.withdraw(req.user, Number(req.params.id), req.body));
}));

/* ---------------- documents (PP-13, PP-14) ---------------- */
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
r.post('/documents', upload.single('file'), wrap((req) => {
  const f = familyOf(req);
  const b = req.body;
  if (!req.file) throw new AppError(400, 'file_required');
  const maxMb = setting('max_file_mb', 5);
  if (req.file.size > maxMb * 1024 * 1024) throw new AppError(400, 'file_too_large', `Maximum ${maxMb} MB per file`);
  const ext = path.extname(req.file.originalname).slice(1).toLowerCase();
  const okTypes = setting('allowed_file_types', ['pdf', 'jpg', 'jpeg', 'png']);
  const okMime = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' };
  if (!okTypes.includes(ext) || okMime[ext] !== req.file.mimetype) throw new AppError(400, 'file_type', 'Accepted formats: PDF, JPG, PNG');
  if (!get(`SELECT 1 FROM lists WHERE list_type = 'doc_type' AND code = ?`, b.doc_type)) throw new AppError(400, 'bad_doc_type');
  if (['tenancy', 'utility_bill'].includes(b.doc_type) && !b.ref_number) throw new AppError(400, 'ref_number_required', 'Contract / account number is required');
  if (b.doc_type === 'utility_bill') {
    if (!b.issue_date) throw new AppError(400, 'issue_date_required');
    const cutoff = new Date(today()); cutoff.setUTCMonth(cutoff.getUTCMonth() - setting('utility_bill_max_age_months', 3));
    if (b.issue_date < isoDate(cutoff)) throw new AppError(400, 'bill_too_old', `Utility bill must be issued in the last ${setting('utility_bill_max_age_months', 3)} months (BR-10)`);
  }
  if (b.child_id) ownChild(req, b.child_id);
  if (b.application_id) ownApp(req, b.application_id);
  const name = `${crypto.randomBytes(12).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), req.file.buffer);
  const id = insert('documents', {
    family_id: f.id, child_id: b.child_id || null, application_id: b.application_id || null, doc_type: b.doc_type, filename: req.file.originalname, mime: req.file.mimetype,
    size: req.file.size, storage_path: name, expiry_date: b.expiry_date || null, issue_date: b.issue_date || null, ref_number: b.ref_number || null, status: 'pending', uploaded_by: req.user.id, uploaded_at: nowIso(),
  });
  audit(req.user, 'document.uploaded', 'document', id, null, { doc_type: b.doc_type, application_id: b.application_id || null });
  if (b.application_id) A.event(A.getApp(Number(b.application_id)), 'document_uploaded', req.user, b.doc_type);
  return get('SELECT * FROM documents WHERE id = ?', id);
}));

/* ---------------- renewal & leaving (PP-19, PP-21) ---------------- */
r.post('/children/:id/renew', wrap((req) => {
  const c = ownChild(req, req.params.id);
  const f = familyOf(req);
  const b = req.body;
  let route = {};
  if (b.transportMode === 'bus') {
    const enr = get(`SELECT * FROM enrolments WHERE child_id = ? AND ay = ? AND status = 'pending_renewal'`, c.id, admissionAY().code);
    const ns = transport.nearestStop(f.home_lat, f.home_lng, enr?.school_id);
    if (!ns.served) throw new AppError(400, 'bus_not_available');
    route = { busRouteId: ns.route_id, busStopId: ns.stop_id };
  }
  const res = A.renew(req.user, { childId: c.id, addressUnchanged: !!b.addressUnchanged, contactConfirmed: !!b.contactConfirmed, transportMode: b.transportMode, ...route });
  return { converted: res.converted, app: A.appView(res.app) };
}));

r.post('/children/:id/leave', wrap((req) => {
  const c = ownChild(req, req.params.id);
  return A.requestLeave(req.user, { childId: c.id, ...req.body });
}));

export default r;
