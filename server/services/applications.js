// Application lifecycle (sections 4.1, 4.2, 5 and 5.1).
import { all, get, insert, update, tx, parse } from '../db/index.js';
import {
  setting, nowIso, today, addWorkingDays, workingDaysBetween, haversineKm, cycleOf, admissionAY, currentAY,
  windowStatus, audit, AppError, isoDate, ayStartYear, slaState, listLabel,
} from './core.js';
import { gradeSeats, pickSection, sectionSeats, checkAlerts } from './capacity.js';
import { maps, transport, sis } from '../mocks/index.js';
import { notify, familyUsers, schoolStaff, clusterOfficers, ministryAdmins } from './notify.js';

export const ACTIVE = ['draft', 'submitted', 'under_review', 'info_requested', 'passed', 'escalated', 'offer_made'];
export const OPEN = ACTIVE.filter((s) => s !== 'draft');
export const ENDED = ['accepted', 'rejected', 'withdrawn', 'lapsed', 'closed'];
export const TYPE_OF = { new: 'new', private: 'transfer', other_emirate: 'transfer', abroad: 'transfer', moe_transfer: 'transfer', renewal: 'renewal' };

const school = (id) => get('SELECT * FROM schools WHERE id = ?', id);
const bi = (row, f = 'name') => (row ? { en: row[`${f}_en`], ar: row[`${f}_ar`] } : { en: '', ar: '' });

export function getApp(id) {
  const a = get('SELECT * FROM applications WHERE id = ?', id);
  if (!a) throw new AppError(404, 'not_found');
  return a;
}

export function event(app, action, actor, note, status) {
  insert('application_events', {
    application_id: app.id, at: nowIso(), status: status ?? app.status, action,
    actor_user_id: actor?.id ?? null, school_id: app.current_school_id ?? null, note: note ?? null,
  });
}

// Every state change goes through here so the audit log (SB-09) always has previous and new value.
function change(app, patch, actor, action, note, reason) {
  const prev = Object.fromEntries(Object.keys(patch).map((k) => [k, app[k]]));
  update('applications', app.id, { ...patch, updated_at: nowIso() });
  const next = { ...app, ...patch };
  event(next, action, actor, note);
  audit(actor, `application.${action}`, 'application', app.ref || app.id, prev, patch, reason);
  return next;
}

/* ---------------- Eligibility & school search (PP-10, PP-11, PP-12, BR-03) ---------------- */
export function siblingSchools(familyId, childId) {
  if (!familyId) return [];
  const ays = [currentAY().code, admissionAY().code];
  return all(
    `SELECT DISTINCT e.school_id FROM enrolments e JOIN children c ON c.id = e.child_id
      WHERE c.family_id = ? AND c.id != ? AND e.ay IN (?, ?) AND e.status IN ('enrolled','pending_renewal','leaving')`,
    familyId, childId || 0, ...ays
  ).map((r) => r.school_id);
}

/* BR-03: which schools are open to a home pin (before the grade filter).
 *  catchment_and_grade – catchment contains the pin (starting value)
 *  catchment_or_radius – catchment contains the pin, or the school is within radius_km of it
 *  grade_in_cluster    – any school in the pilot cluster that offers the grade */
export const ELIGIBILITY_MODES = ['catchment_and_grade', 'catchment_or_radius', 'grade_in_cluster'];
export function eligibilityRule() {
  const r = setting('eligible_schools_rule', 'catchment_and_grade');
  const v = typeof r === 'string' ? { mode: r } : r || {};
  return { mode: ELIGIBILITY_MODES.includes(v.mode) ? v.mode : 'catchment_and_grade', radius_km: Number(v.radius_km) > 0 ? Number(v.radius_km) : 3 };
}
export function eligibleArea(lat, lng) {
  const rule = eligibilityRule();
  const inCatchment = new Set(maps.catchmentsContaining(lat, lng));
  const schools = all('SELECT * FROM schools ORDER BY id');
  const ids = new Set(schools.filter((s) =>
    rule.mode === 'grade_in_cluster' ? true
      : inCatchment.has(s.id) || (rule.mode === 'catchment_or_radius' && haversineKm({ lat, lng }, s) <= rule.radius_km)
  ).map((s) => s.id));
  return { ids, inCatchment, schools, rule };
}

export function eligibleSchools({ lat, lng, grade, ay = admissionAY().code, familyId, childId }) {
  const { ids: inArea, inCatchment, schools, rule } = eligibleArea(lat, lng);
  const sibs = siblingSchools(familyId, childId);
  const describe = (s) => {
    const seats = gradeSeats(s.id, ay, grade);
    const bus = transport.nearestStop(lat, lng, s.id);
    const cycles = [...new Set(all('SELECT DISTINCT grade FROM sections WHERE school_id = ? AND ay = ?', s.id, ay).map((r) => cycleOf(r.grade)))];
    return {
      id: s.id, code: s.code, name_en: s.name_en, name_ar: s.name_ar, area_en: s.area_en, area_ar: s.area_ar, lat: s.lat, lng: s.lng,
      distance_km: Math.round(haversineKm({ lat, lng }, s) * 10) / 10,
      cycles, offers_grade: !!seats,
      seat_status: seats ? seats.status : null, seats_available: seats ? Math.max(0, seats.available) : 0,
      bus_served: bus.served, bus,
      sibling: sibs.includes(s.id),
      in_catchment: inCatchment.has(s.id),
    };
  };
  const eligible = schools.filter((s) => inArea.has(s.id)).map(describe).filter((s) => s.offers_grade).sort((a, b) => a.distance_km - b.distance_km);
  const anySeat = eligible.some((s) => s.seat_status !== 'full');
  let alternatives = [];
  if (!anySeat) {
    // PP-11 / CC-04: nearest schools outside the catchment with a seat, marked "Cluster approval required"
    alternatives = schools.filter((s) => !inArea.has(s.id)).map(describe)
      .filter((s) => s.offers_grade && s.seat_status !== 'full')
      .sort((a, b) => a.distance_km - b.distance_km)
      .slice(0, setting('out_of_catchment_suggestions', 3))
      .map((s) => ({ ...s, cluster_approval_required: true }));
  }
  return { location: maps.reverseGeocode(lat, lng), eligible, alternatives, any_seat: anySeat, max_preferences: setting('max_preferences', 3), rule };
}

/* ---------------- Document checklist (PP-13, PP-14, section 6) ---------------- */
const CHILD_DOCS = ['child_eid', 'child_passport', 'birth_certificate', 'child_photo', 'vaccination', 'school_reports', 'transfer_certificate', 'equivalency', 'sod_reports', 'exceptional_support'];

export function checklist(app) {
  const matrix = setting('doc_matrix', {});
  const conditions = setting('doc_conditions', {});
  const child = get('SELECT * FROM children WHERE id = ?', app.child_id);
  const family = get('SELECT * FROM families WHERE id = ?', app.family_id) || {};
  const guardians = all(`SELECT * FROM guardians WHERE family_id = ? AND status = 'active'`, app.family_id);
  const facts = {
    non_uae_child: child.nationality !== 'AE',
    non_uae_guardian: guardians.some((g) => g.nationality && g.nationality !== 'AE'),
    sod: !!child.sod,
    sole_custody: !!family.sole_custody,
    moved: app.type === 'transfer' && !!app.renewal_of_enrolment_id,
  };
  const pathway = app.pathway === 'moe_transfer' ? (app.renewal_of_enrolment_id ? 'renewal_moved' : 'other_emirate') : app.pathway;
  const items = [];
  for (const [docType, byPath] of Object.entries(matrix)) {
    let req = byPath[pathway] ?? byPath[app.pathway] ?? '-';
    const cond = conditions[docType];
    if (cond && !facts[cond]) continue; // condition does not apply (e.g. no passport for UAE nationals)
    if (req === '-') continue;
    if (req === 'C' && cond && facts[cond]) req = 'R';
    items.push({ doc_type: docType, requirement: req });
  }
  if (app.residence_route && app.residence_route !== 'own') items.push({ doc_type: 'host_documents', requirement: 'R' });
  if (app.exceptional) items.push({ doc_type: 'exceptional_support', requirement: 'R' });

  const t = today();
  const maxBillMonths = setting('utility_bill_max_age_months', 3);
  const billCutoff = new Date(t); billCutoff.setUTCMonth(billCutoff.getUTCMonth() - maxBillMonths);
  return items.map((it) => {
    const isChild = CHILD_DOCS.includes(it.doc_type);
    const docs = all(
      `SELECT * FROM documents WHERE doc_type = ? AND ${isChild ? 'child_id = ?' : 'family_id = ?'} AND status != 'rejected' ORDER BY uploaded_at DESC`,
      it.doc_type, isChild ? app.child_id : app.family_id
    );
    const valid = docs.filter((d) => {
      if (d.expiry_date && d.expiry_date < t) return false;
      if (it.doc_type === 'utility_bill' && d.issue_date && d.issue_date < isoDate(billCutoff)) return false;
      return true;
    });
    const doc = valid[0] || null;
    // 'E' (renewal) = only needed if the existing one expired; 'M' = only if the family moved
    let needed = it.requirement === 'R';
    if (it.requirement === 'E') needed = docs.length > 0 && !doc;
    if (it.requirement === 'M') needed = facts.moved;
    const rejected = get(`SELECT * FROM documents WHERE doc_type = ? AND ${isChild ? 'child_id = ?' : 'family_id = ?'} AND status = 'rejected' ORDER BY uploaded_at DESC LIMIT 1`, it.doc_type, isChild ? app.child_id : app.family_id);
    return {
      ...it, needed, optional: it.requirement === 'C' || (!needed && it.requirement !== 'R'),
      label: listLabel('doc_type', it.doc_type),
      document: doc, reused: !!doc && doc.application_id !== app.id,
      expired: docs.length > 0 && !doc,
      last_rejected: !doc && rejected ? rejected : null,
      satisfied: !!doc || !needed,
    };
  });
}

/* ---------------- Priority (BR-05) ---------------- */
export function priorityKey(app, schoolId = app.current_school_id) {
  const child = get('SELECT * FROM children WHERE id = ?', app.child_id);
  const s = school(schoolId);
  const order = setting('priority_order', ['sod', 'sibling', 'national', 'distance', 'submitted']);
  const sibs = parse(app.sibling_school_ids, []);
  const f = {
    sod: child.sod ? 0 : 1,
    sibling: sibs.includes(schoolId) ? 0 : 1,
    national: child.nationality === 'AE' ? 0 : 1,
    distance: app.home_lat && s ? haversineKm({ lat: app.home_lat, lng: app.home_lng }, s) : 999,
    submitted: app.submitted_at ? new Date(app.submitted_at).getTime() : Infinity,
  };
  return order.map((k) => f[k]);
}
export const comparePriority = (a, b) => {
  for (let i = 0; i < a.key.length; i++) if (a.key[i] !== b.key[i]) return a.key[i] < b.key[i] ? -1 : 1;
  return 0;
};

/* ---------------- Bus seat lifecycle (BR-09) ----------------
 * hold_from:  submission | offer | acceptance   – when a seat is first held
 * confirm_on: offer | acceptance                – when the held seat is confirmed
 * release_on: decline, lapse, withdrawal, rejection, closure – which endings give the seat back */
export const BUS_HOLD_FROM = ['submission', 'offer', 'acceptance'];
export const BUS_CONFIRM_ON = ['offer', 'acceptance'];
export const BUS_RELEASE_EVENTS = ['decline', 'lapse', 'withdrawal', 'rejection', 'closure'];
export function busRule() {
  const r = setting('bus_seat_hold', {}) || {};
  return {
    hold_from: BUS_HOLD_FROM.includes(r.hold_from) ? r.hold_from : 'submission',
    confirm_on: BUS_CONFIRM_ON.includes(r.confirm_on) ? r.confirm_on : 'acceptance',
    release_on: Array.isArray(r.release_on) ? r.release_on.filter((e) => BUS_RELEASE_EVENTS.includes(e)) : BUS_RELEASE_EVENTS,
  };
}
// Apply the rule at a stage of the application; returns the seat when something changed.
function busStage(app, stage, actor) {
  if (app.transport_mode !== 'bus' || !app.bus_route_id) return null;
  const r = busRule();
  if (r.hold_from !== stage && r.confirm_on !== stage) return null;
  const existing = get(`SELECT * FROM bus_seats WHERE application_id = ? AND status IN ('held','confirmed','waitlisted')`, app.id);
  let seat = existing || transport.hold({ routeId: app.bus_route_id, stopId: app.bus_stop_id, childId: app.child_id, applicationId: app.id, ay: app.ay });
  if (!existing) event(app, `bus_${seat.status}`, actor);
  if (r.confirm_on === stage) {
    seat = transport.confirm(app.id) || seat;
    event(app, seat.status === 'confirmed' ? 'bus_confirmed' : 'bus_waitlisted', actor);
    const child = get('SELECT * FROM children WHERE id = ?', app.child_id);
    notify(seat.status === 'confirmed' ? 'bus_confirmed' : 'bus_waitlisted', familyUsers(app.family_id), { ref: app.ref, child: bi(child, 'full_name') }, { applicationId: app.id });
  }
  return seat;
}
function busRelease(app, ending) {
  if (!busRule().release_on.includes(ending)) return null;
  const seat = transport.release(app.id);
  if (seat) event(app, 'bus_released', null);
  return seat;
}

/* ---------------- Draft & submission (PP-16, PP-17, BR-11) ---------------- */
export function assertOneActive(childId, ay, exceptId) {
  const max = setting('max_active_applications_per_child', 1);
  const n = get(`SELECT COUNT(*) n FROM applications WHERE child_id = ? AND ay = ? AND id != ? AND status IN (${OPEN.map(() => '?').join(',')})`, childId, ay, exceptId || 0, ...OPEN).n;
  if (n >= max) throw new AppError(409, 'active_application_exists', 'BR-11: the child already has an active application for this academic year');
}

function nextRef(emirate, year) {
  const prefix = `ADM-${year}-${emirate}-`;
  const last = get(`SELECT ref FROM applications WHERE ref LIKE ? ORDER BY ref DESC LIMIT 1`, prefix + '%');
  const n = last ? Number(last.ref.slice(prefix.length)) + 1 : 1;
  return prefix + String(n).padStart(6, '0');
}

export function submit(user, appId) {
  return tx(() => {
    const app = getApp(appId);
    if (app.status !== 'draft') throw new AppError(409, 'not_draft');
    assertOneActive(app.child_id, app.ay, app.id);
    const prefs = parse(app.preferences, []);
    if (!prefs.length) throw new AppError(400, 'no_preferences');
    if (prefs.length > setting('max_preferences', 3)) throw new AppError(400, 'too_many_preferences');
    if (!app.declarations) throw new AppError(400, 'declarations_required');
    if (!app.transport_mode) throw new AppError(400, 'transport_required');
    const missing = checklist(app).filter((c) => !c.satisfied);
    if (missing.length) throw new AppError(400, 'documents_missing', 'Required documents missing', missing.map((m) => m.doc_type));

    // windows (AD-01) and exceptional transfers (PP-22 / BR-14)
    const winType = app.type === 'renewal' ? 'renewal' : app.type === 'transfer' && !app.renewal_of_enrolment_id ? 'transfer' : app.type === 'transfer' ? 'renewal' : 'new';
    const w = windowStatus(app.ay, winType);
    if (!w.open) {
      if (app.type !== 'transfer') throw new AppError(409, 'window_closed', `The ${winType} window is closed`);
      if (!app.exceptional || !app.exceptional_reason) throw new AppError(409, 'exceptional_required', 'Transfer window closed: an exceptional request with reason and supporting document is required');
    }

    const fam = get('SELECT * FROM families WHERE id = ?', app.family_id);
    const t = nowIso();
    const ref = nextRef(fam?.emirate || setting('default_emirate', 'SHJ'), new Date(t).getUTCFullYear());
    const sibs = siblingSchools(app.family_id, app.child_id);
    // a preference outside the BR-03 eligible area needs cluster approval
    const inArea = eligibleArea(app.home_lat, app.home_lng).ids;
    const outOfCatchment = prefs.some((p) => !inArea.has(p));

    let escalation = null;
    if (app.exceptional && exceptionalApprover() !== 'school') escalation = 'exceptional_transfer';
    else if (outOfCatchment) escalation = 'out_of_catchment';
    else if (app.residence_route && app.residence_route !== 'own') escalation = 'alternative_residence';

    let next = change(app, {
      ref, submitted_at: t, status: escalation ? 'escalated' : 'submitted', escalation_reason: escalation,
      cluster_review: escalation ? 1 : 0, out_of_catchment: outOfCatchment ? 1 : 0,
      current_school_id: prefs[0], pref_index: 0, sibling_school_ids: sibs,
      sla_due_at: escalation ? null : addWorkingDays(t, setting('decision_sla_working_days', 2)),
    }, user, 'submitted', escalation ? `escalation:${escalation}` : null);

    busStage(next, 'submission', null); // BR-09
    const child = get('SELECT * FROM children WHERE id = ?', app.child_id);
    const vars = { ref, child: { en: child.full_name_en, ar: child.full_name_ar }, school: bi(school(prefs[0])) };
    notify('application_submitted', familyUsers(app.family_id), vars, { applicationId: app.id, channels: ['inapp', 'email', 'sms'] });
    if (escalation) {
      const approvers = escalation === 'exceptional_transfer' && exceptionalApprover() === 'ministry_admin' ? ministryAdmins() : clusterOfficers(prefs[0]);
      notify('escalated_to_cluster', approvers, { ...vars, reason: escalation }, { applicationId: app.id });
    }
    else {
      notify('new_in_queue', schoolStaff(prefs[0]), vars, { applicationId: app.id });
      next = autoPassIfFull(next);
    }
    return next;
  });
}

/* ---------------- School decisions (SB-04) ---------------- */
function assertAtSchool(user, app) {
  if (['registrar', 'principal'].includes(user.role) && app.current_school_id !== user.school_id) throw new AppError(403, 'not_your_school');
}
function firstDecision(app) {
  return app.first_decision_at ? {} : { first_decision_at: nowIso() };
}

export function openForReview(user, appId) {
  const app = getApp(appId);
  if (['submitted', 'passed'].includes(app.status) && ['registrar', 'principal'].includes(user.role) && app.current_school_id === user.school_id) {
    return change(app, { status: 'under_review' }, user, 'review_started');
  }
  return app;
}

export function docDecision(user, docId, { status, reason }) {
  return tx(() => {
    const d = get('SELECT * FROM documents WHERE id = ?', docId);
    if (!d) throw new AppError(404, 'not_found');
    if (!['accepted', 'rejected'].includes(status)) throw new AppError(400, 'bad_status');
    if (status === 'rejected' && !reason) throw new AppError(400, 'reason_required');
    update('documents', docId, { status, reject_reason: status === 'rejected' ? reason : null });
    audit(user, `document.${status}`, 'document', docId, { status: d.status }, { status, reason });
    if (d.application_id) event(getApp(d.application_id), `document_${status}`, user, `${d.doc_type}${reason ? ': ' + reason : ''}`);
    return get('SELECT * FROM documents WHERE id = ?', docId);
  });
}

export function requestInfo(user, appId, { reason, note, docTypes = [] }) {
  return tx(() => {
    const app = getApp(appId);
    assertAtSchool(user, app);
    if (!['submitted', 'under_review', 'passed'].includes(app.status)) throw new AppError(409, 'bad_state');
    if (!reason) throw new AppError(400, 'reason_required');
    const due = addWorkingDays(nowIso(), setting('info_response_working_days', 5));
    const next = change(app, { status: 'info_requested', paused_at: nowIso(), info_due_at: due, info_request_note: JSON.stringify({ reason, note, docTypes }) }, user, 'info_requested', note, reason);
    event(next, 'sla_paused', null);
    const child = get('SELECT * FROM children WHERE id = ?', app.child_id);
    const r = listLabel('info_reason', reason) || { label_en: reason, label_ar: reason };
    notify('info_requested', familyUsers(app.family_id), { ref: app.ref, child: bi(child, 'full_name'), reason: { en: r.label_en, ar: r.label_ar }, note: note || '', due: due.slice(0, 10) }, { applicationId: app.id });
    return next;
  });
}

// Parent responds (after uploading the requested document). The SLA clock resumes and is
// extended by the working days it was paused (BR-07 / A3).
export function respondInfo(user, appId, { message }) {
  return tx(() => {
    const app = getApp(appId);
    if (app.status !== 'info_requested') throw new AppError(409, 'bad_state');
    const pausedDays = workingDaysBetween(app.paused_at, nowIso());
    const newDue = app.sla_due_at ? addWorkingDays(app.sla_due_at, pausedDays) : null;
    const next = change(app, { status: 'under_review', paused_at: null, info_due_at: null, sla_due_at: app.first_decision_at ? app.sla_due_at : newDue }, user, 'info_provided', message);
    event(next, 'sla_resumed', null, `paused ${pausedDays} working day(s); due ${newDue ? newDue.slice(0, 10) : '-'}`);
    notify('info_provided', schoolStaff(app.current_school_id), { ref: app.ref }, { applicationId: app.id });
    return next;
  });
}

/* Offer a place (SB-04, SB-05, CC-05). Runs as one serialised transaction: the available-seat
 * check and the offer are atomic, so only one of two competing requests can take the last seat. */
export function offer(user, appId, { sectionId, force = false, reason } = {}) {
  const result = tx(() => {
    const app = getApp(appId);
    if (['registrar', 'principal'].includes(user.role) && app.current_school_id !== user.school_id && parse(app.preferences, []).includes(user.school_id)) {
      // CC-05: a competing offer took the last seat and this application has already moved on
      throw new AppError(409, 'no_seat', 'The last seat was just taken – the application has moved to its next preference', { app: appView(app) });
    }
    if (['registrar', 'principal'].includes(user.role)) assertAtSchool(user, app);
    const allowed = ['cluster_officer', 'ministry_admin'].includes(user.role) ? ['escalated', 'submitted', 'under_review', 'passed'] : ['submitted', 'under_review', 'passed'];
    if (!allowed.includes(app.status)) throw new AppError(409, 'bad_state', `Application is ${app.status}`);
    let sec = sectionId ? sectionSeats(app.current_school_id, app.ay, app.grade).find((s) => s.id === Number(sectionId)) : pickSection(app.current_school_id, app.ay, app.grade);
    if (!sec || sec.available <= 0) {
      if (!sec) sec = sectionSeats(app.current_school_id, app.ay, app.grade)[0];
      if (!force) return { ok: false, app, code: 'no_seat' };
    }
    const due = addWorkingDays(nowIso(), setting('offer_acceptance_working_days', 5));
    const next = change(app, { status: 'offer_made', offered_section_id: sec.id, offer_due_at: due, decided_at: nowIso(), ...firstDecision(app) }, user, force ? 'offer_made_forced' : 'offer_made', `${app.grade}-${sec.name}`, reason);
    busStage(next, 'offer', null); // BR-09
    const s = school(app.current_school_id);
    const child = get('SELECT * FROM children WHERE id = ?', app.child_id);
    notify('offer_made', familyUsers(app.family_id), { ref: app.ref, child: bi(child, 'full_name'), school: bi(s), grade: app.grade, section: sec.name, due: due.slice(0, 10) }, { applicationId: app.id });
    checkAlerts(app.current_school_id, app.ay, app.grade);
    return { ok: true, app: next };
  });
  if (!result.ok && result.app.status === 'escalated') throw new AppError(409, 'no_seat', 'No seat available in this grade');
  if (!result.ok) {
    // CC-05 / A6: the loser stays queued or moves on automatically
    const passed = tx(() => passNext(null, appId, { auto: true, note: 'No seat available at the time of offer' }));
    throw new AppError(409, 'no_seat', 'No seat available in this grade – the application was passed to the next preference', { app: passed });
  }
  sweepFull(result.app.current_school_id, result.app.ay, result.app.grade);
  return result.app;
}

// CC-04 / A4: once a grade is full, queued applications there move on to their next preference.
export function sweepFull(schoolId, ay, grade) {
  const g = gradeSeats(schoolId, ay, grade);
  if (!g || g.available > 0) return [];
  const waiting = all(`SELECT id FROM applications WHERE current_school_id = ? AND ay = ? AND grade = ? AND status IN ('submitted','under_review','passed')`, schoolId, ay, grade);
  return waiting.map((w) => tx(() => passNext(null, w.id, { auto: true, note: 'Grade reached 100% capacity' })));
}

function autoPassIfFull(app) {
  const g = gradeSeats(app.current_school_id, app.ay, app.grade);
  if (g && g.available <= 0) return passNext(null, app.id, { auto: true, note: 'First preference full at submission' });
  return app;
}

export function passNext(user, appId, { auto = false, note } = {}) {
  const app = getApp(appId);
  if (user) assertAtSchool(user, app);
  if (!['submitted', 'under_review', 'passed'].includes(app.status)) throw new AppError(409, 'bad_state');
  const prefs = parse(app.preferences, []);
  const from = school(app.current_school_id);
  let i = app.pref_index + 1;
  // skip later preferences that are already full
  while (i < prefs.length) {
    const g = gradeSeats(prefs[i], app.ay, app.grade);
    if (g && g.available > 0) break;
    event(app, 'preference_skipped_full', null, school(prefs[i])?.name_en);
    i++;
  }
  const child = get('SELECT * FROM children WHERE id = ?', app.child_id);
  if (i >= prefs.length) {
    // A5: no preference has a seat → escalate to the cluster officer
    const next = change(app, { status: 'escalated', escalation_reason: 'no_seat', ...firstDecision(app) }, user, auto ? 'auto_escalated' : 'escalated', note);
    notify('escalated_to_cluster', clusterOfficers(app.current_school_id), { ref: app.ref, child: bi(child, 'full_name'), reason: 'no_seat' }, { applicationId: app.id });
    notify('parent_escalated', familyUsers(app.family_id), { ref: app.ref, child: bi(child, 'full_name') }, { applicationId: app.id });
    return next;
  }
  const to = school(prefs[i]);
  const next = change(app, {
    status: 'passed', pref_index: i, current_school_id: prefs[i], ...firstDecision(app),
    sla_due_at: addWorkingDays(nowIso(), setting('decision_sla_working_days', 2)),
  }, user, auto ? 'auto_passed' : 'passed', `${from?.name_en} → ${to.name_en}${note ? ' · ' + note : ''}`);
  notify('passed_next', familyUsers(app.family_id), { ref: app.ref, child: bi(child, 'full_name'), from: bi(from), to: bi(to) }, { applicationId: app.id });
  notify('new_in_queue', schoolStaff(prefs[i]), { ref: app.ref, child: bi(child, 'full_name'), school: bi(to) }, { applicationId: app.id });
  return next;
}

export function escalate(user, appId, { note }) {
  return tx(() => {
    const app = getApp(appId);
    assertAtSchool(user, app);
    if (!['submitted', 'under_review', 'passed'].includes(app.status)) throw new AppError(409, 'bad_state');
    const next = change(app, { status: 'escalated', escalation_reason: 'school', ...firstDecision(app) }, user, 'escalated', note);
    const child = get('SELECT * FROM children WHERE id = ?', app.child_id);
    notify('escalated_to_cluster', clusterOfficers(app.current_school_id), { ref: app.ref, child: bi(child, 'full_name'), reason: 'school' }, { applicationId: app.id });
    notify('parent_escalated', familyUsers(app.family_id), { ref: app.ref, child: bi(child, 'full_name') }, { applicationId: app.id });
    return next;
  });
}

export function reject(user, appId, { reason, note }) {
  return tx(() => {
    const app = getApp(appId);
    if (['registrar', 'principal'].includes(user.role)) assertAtSchool(user, app);
    if (['cluster_officer', 'ministry_admin'].includes(user.role)) assertCanDecide(user, app);
    if (!OPEN.includes(app.status) || app.status === 'offer_made') throw new AppError(409, 'bad_state');
    if (!reason) throw new AppError(400, 'reason_required');
    const next = change(app, { status: 'rejected', end_reason: reason, decided_at: nowIso(), ...firstDecision(app) }, user, 'rejected', note, reason);
    busRelease(next, 'rejection'); // BR-09
    const r = listLabel('reject_reason', reason) || { label_en: reason, label_ar: reason };
    notify('application_rejected', familyUsers(app.family_id), { ref: app.ref, reason: { en: r.label_en, ar: r.label_ar } }, { applicationId: app.id });
    return next;
  });
}

/* ---------------- Cluster officer (SB-07, PP-22) ---------------- */
/* BR-14: who approves an exceptional transfer before the school receives it.
 *  cluster_officer (starting value) | ministry_admin | school (no prior approval – the school decides) */
export const EXCEPTIONAL_APPROVERS = ['cluster_officer', 'ministry_admin', 'school'];
export function exceptionalApprover() {
  const v = setting('exceptional_transfer_approver', 'cluster_officer');
  return EXCEPTIONAL_APPROVERS.includes(v) ? v : 'cluster_officer';
}
// Exceptional transfers are decided by the configured approver; every other escalation by the cluster officer.
export function canDecideEscalation(user, app) {
  if (app.status === 'escalated' && app.escalation_reason === 'exceptional_transfer') return user.role === exceptionalApprover();
  return user.role === 'cluster_officer';
}
function assertCanDecide(user, app) {
  if (!canDecideEscalation(user, app)) throw new AppError(403, 'not_the_approver', 'This escalation is decided by another role (BR-14)');
}

export function clusterApprove(user, appId, { note }) {
  return tx(() => {
    const app = getApp(appId);
    if (app.status !== 'escalated') throw new AppError(409, 'bad_state');
    assertCanDecide(user, app);
    const next = change(app, { status: 'submitted', cluster_approved: 1, sla_due_at: addWorkingDays(nowIso(), setting('decision_sla_working_days', 2)) }, user, 'cluster_approved', note);
    const child = get('SELECT * FROM children WHERE id = ?', app.child_id);
    notify('cluster_approved', familyUsers(app.family_id), { ref: app.ref, child: bi(child, 'full_name') }, { applicationId: app.id });
    notify('new_in_queue', schoolStaff(app.current_school_id), { ref: app.ref, child: bi(child, 'full_name'), school: bi(school(app.current_school_id)) }, { applicationId: app.id });
    return autoPassIfFull(next);
  });
}

// Place an escalated application at any school in the cluster (A5) – the out-of-catchment
// placement is approved by this action.
export function clusterPlace(user, appId, { schoolId, sectionId, note }) {
  const app = tx(() => {
    const a = getApp(appId);
    if (!['escalated', 'submitted', 'under_review', 'passed'].includes(a.status)) throw new AppError(409, 'bad_state');
    assertCanDecide(user, a);
    const s = school(schoolId);
    if (!s || (user.cluster_id && s.cluster_id !== user.cluster_id)) throw new AppError(403, 'outside_cluster');
    return change(a, { current_school_id: Number(schoolId), cluster_approved: 1, status: 'escalated' }, user, 'cluster_reassigned', `${school(a.current_school_id)?.name_en} → ${s.name_en}${note ? ' · ' + note : ''}`);
  });
  return offer(user, app.id, { sectionId });
}

/* ---------------- Parent actions (PP-18, BR-08, BR-09) ---------------- */
export function accept(user, appId) {
  const res = tx(() => {
    const app = getApp(appId);
    if (app.status !== 'offer_made') throw new AppError(409, 'bad_state');
    const sec = get('SELECT * FROM sections WHERE id = ?', app.offered_section_id);
    const enrolmentId = insert('enrolments', {
      child_id: app.child_id, school_id: app.current_school_id, ay: app.ay, grade: app.grade, section_id: sec.id,
      status: 'enrolled', source: app.type, application_id: app.id, start_date: get('SELECT start_date FROM academic_years WHERE code = ?', app.ay)?.start_date, created_at: nowIso(),
    });
    // a transfer gives up the seat the child held for next year at the old school
    const old = all(`SELECT * FROM enrolments WHERE child_id = ? AND ay = ? AND id != ? AND status IN ('pending_renewal','enrolled')`, app.child_id, app.ay, enrolmentId);
    for (const o of old) {
      update('enrolments', o.id, { status: 'left', leave_reason: 'transfer_out', leave_date: today(), left_at: nowIso(), leave_destination: school(app.current_school_id).name_en });
      checkAlerts(o.school_id, o.ay, o.grade);
    }
    const next = change(app, { status: 'accepted', decided_at: nowIso() }, user, 'accepted');
    busStage(next, 'acceptance', null); // BR-09
    const sisRes = sis.confirmPlacement(next, enrolmentId);
    event(next, 'sis_placement_confirmed', null, sisRes.sis_reference);
    const child = get('SELECT * FROM children WHERE id = ?', app.child_id);
    const vars = { ref: app.ref, child: bi(child, 'full_name'), school: bi(school(app.current_school_id)), grade: app.grade, section: sec.name };
    notify('offer_accepted', familyUsers(app.family_id), vars, { applicationId: app.id });
    notify('offer_accepted_school', schoolStaff(app.current_school_id), vars, { applicationId: app.id });
    checkAlerts(app.current_school_id, app.ay, app.grade);
    return next;
  });
  return res;
}

const ENDING_OF = { offer_declined: 'decline', withdrawn: 'withdrawal', offer_lapsed: 'lapse', closed_no_response: 'closure' };
function endWithRelease(user, app, status, action, reason) {
  const next = change(app, { status, end_reason: reason, decided_at: nowIso() }, user, action, null, reason);
  busRelease(next, ENDING_OF[action]); // BR-09
  if (app.status === 'offer_made') checkAlerts(app.current_school_id, app.ay, app.grade);
  return next;
}

export function decline(user, appId, { reason }) {
  return tx(() => {
    const app = getApp(appId);
    if (app.status !== 'offer_made') throw new AppError(409, 'bad_state');
    const next = endWithRelease(user, app, 'withdrawn', 'offer_declined', reason || 'offer_declined');
    notify('offer_declined_school', schoolStaff(app.current_school_id), { ref: app.ref }, { applicationId: app.id });
    return next;
  });
}

export function withdraw(user, appId, { reason }) {
  return tx(() => {
    const app = getApp(appId);
    if (!OPEN.includes(app.status) && app.status !== 'draft') throw new AppError(409, 'bad_state');
    if (app.status === 'draft') {
      return change(app, { status: 'withdrawn', end_reason: 'draft_discarded' }, user, 'withdrawn');
    }
    return endWithRelease(user, app, 'withdrawn', 'withdrawn', reason || 'parent_withdrew');
  });
}

/* ---------------- Force registration (CC-06) ---------------- */
export function forceRegister(user, { appId, sectionId, reason }) {
  if (user.role !== 'ministry_admin' || !user.force_registration) throw new AppError(403, 'force_permission_required');
  if (!reason || reason.trim().length < 5) throw new AppError(400, 'reason_required');
  const app = getApp(appId);
  if (!OPEN.includes(app.status) || app.status === 'offer_made') throw new AppError(409, 'bad_state');
  const placed = tx(() => {
    const sec = get('SELECT * FROM sections WHERE id = ?', sectionId);
    if (!sec) throw new AppError(400, 'bad_section');
    const a = change(app, { current_school_id: sec.school_id, status: 'escalated' }, user, 'force_registration_started', null, reason);
    audit(user, 'capacity.force_registration', 'section', sec.id, sectionSeats(sec.school_id, sec.ay, sec.grade).find((s) => s.id === sec.id), { application: app.ref }, reason);
    return a;
  });
  offer(user, placed.id, { sectionId, force: true, reason });
  const acc = accept(user, placed.id);
  update('enrolments', placed.id, { force_registered: 1, source: 'force' }, 'application_id');
  return acc;
}

/* ---------------- Renewal (PP-19) ---------------- */
export function renew(user, { childId, addressUnchanged, contactConfirmed, transportMode, busRouteId, busStopId }) {
  return tx(() => {
    const ay = admissionAY().code;
    const w = windowStatus(ay, 'renewal');
    if (!w.open) throw new AppError(409, 'window_closed', 'The renewal window is closed');
    const child = get('SELECT * FROM children WHERE id = ?', childId);
    const enr = get(`SELECT * FROM enrolments WHERE child_id = ? AND ay = ? AND status = 'pending_renewal'`, childId, ay);
    if (!enr) throw new AppError(409, 'not_renewable');
    if (!contactConfirmed) throw new AppError(400, 'confirm_contact');
    const fam = get('SELECT * FROM families WHERE id = ?', child.family_id);
    const base = {
      child_id: childId, family_id: child.family_id, ay, grade: enr.grade, preferences: [enr.school_id], current_school_id: enr.school_id,
      home_lat: fam.home_lat, home_lng: fam.home_lng, transport_mode: transportMode, bus_route_id: busRouteId || null, bus_stop_id: busStopId || null,
      renewal_of_enrolment_id: enr.id, declarations: 1, created_by: user.id, created_at: nowIso(), updated_at: nowIso(),
    };
    if (!addressUnchanged) {
      // A9: the family moved – the renewal becomes a transfer that needs new residence proof
      assertOneActive(childId, ay);
      const id = insert('applications', { ...base, type: 'transfer', pathway: 'moe_transfer', status: 'draft', preferences: '[]', current_school_id: null });
      const app = getApp(id);
      event(app, 'renewal_converted_to_transfer', user);
      audit(user, 'application.renewal_converted', 'application', id, null, { childId });
      return { converted: true, app };
    }
    const id = insert('applications', { ...base, type: 'renewal', pathway: 'renewal', status: 'accepted', ref: nextRef(fam.emirate || 'SHJ', new Date().getUTCFullYear()), submitted_at: nowIso(), decided_at: nowIso(), first_decision_at: nowIso() });
    const app = getApp(id);
    update('enrolments', enr.id, { status: 'enrolled', source: 'renewal', application_id: id });
    event(app, 'renewed', user, null, 'accepted');
    audit(user, 'enrolment.renewed', 'enrolment', enr.id, { status: 'pending_renewal' }, { status: 'enrolled' });
    if (transportMode === 'bus' && busRouteId) {
      transport.hold({ routeId: busRouteId, stopId: busStopId, childId, applicationId: id, ay });
      const seat = transport.confirm(id);
      event(app, seat.status === 'confirmed' ? 'bus_confirmed' : 'bus_waitlisted', null);
    }
    notify('renewal_confirmed', familyUsers(child.family_id), { ref: app.ref, child: bi(child, 'full_name'), school: bi(school(enr.school_id)), grade: enr.grade }, { applicationId: id });
    return { converted: false, app };
  });
}

/* ---------------- Leavers (PP-21, SB-08) ---------------- */
export function requestLeave(user, { childId, reason, subreason, note, leaveDate, destination }) {
  return tx(() => {
    const enr = get(`SELECT * FROM enrolments WHERE child_id = ? AND ay = ? AND status = 'enrolled'`, childId, currentAY().code);
    if (!enr) throw new AppError(409, 'not_enrolled');
    if (!reason || !leaveDate) throw new AppError(400, 'reason_and_date_required');
    if (reason !== 'other' && !subreason) throw new AppError(400, 'subreason_required');
    if (reason === 'other' && !note) throw new AppError(400, 'note_required');
    update('enrolments', enr.id, { leave_requested_at: nowIso(), leave_requested_by: user.id, leave_reason: reason, leave_subreason: subreason || null, leave_note: note || null, leave_date: leaveDate, leave_destination: destination || null });
    audit(user, 'enrolment.leave_requested', 'enrolment', enr.id, null, { reason, subreason, leaveDate });
    const child = get('SELECT * FROM children WHERE id = ?', childId);
    notify('leave_requested', schoolStaff(enr.school_id), { child: bi(child, 'full_name'), date: leaveDate }, {});
    notify('leave_request_received', familyUsers(child.family_id), { child: bi(child, 'full_name'), date: leaveDate }, {});
    return get('SELECT * FROM enrolments WHERE id = ?', enr.id);
  });
}

export function confirmLeave(user, enrolmentId, patch = {}) {
  return tx(() => {
    const enr = get('SELECT * FROM enrolments WHERE id = ?', enrolmentId);
    if (!enr || enr.status !== 'enrolled') throw new AppError(409, 'bad_state');
    if (['registrar', 'principal'].includes(user.role) && enr.school_id !== user.school_id) throw new AppError(403, 'not_your_school');
    const data = {
      leave_reason: patch.reason || enr.leave_reason, leave_subreason: patch.subreason || enr.leave_subreason,
      leave_note: patch.note ?? enr.leave_note, leave_date: patch.leaveDate || enr.leave_date, leave_destination: patch.destination ?? enr.leave_destination,
    };
    if (!data.leave_reason || !data.leave_date) throw new AppError(400, 'reason_and_date_required');
    update('enrolments', enr.id, { ...data, status: 'leaving' });
    audit(user, 'enrolment.leaver_confirmed', 'enrolment', enr.id, { status: enr.status }, { status: 'leaving', ...data });
    const child = get('SELECT * FROM children WHERE id = ?', enr.child_id);
    if (child.family_id) notify('leave_confirmed', familyUsers(child.family_id), { child: bi(child, 'full_name'), date: data.leave_date }, {});
    releaseLeavers();
    return get('SELECT * FROM enrolments WHERE id = ?', enr.id);
  });
}

// SB-08: seats are released on the leaving date (run by the scheduler and after confirmations).
export function releaseLeavers() {
  const due = all(`SELECT * FROM enrolments WHERE status = 'leaving' AND leave_date <= ?`, today());
  for (const e of due) {
    tx(() => {
      update('enrolments', e.id, { status: 'left', left_at: nowIso() });
      // the seat held for next year is released too
      const nextYear = all(`SELECT * FROM enrolments WHERE child_id = ? AND ay > ? AND status IN ('pending_renewal','enrolled')`, e.child_id, e.ay);
      for (const n of nextYear) {
        update('enrolments', n.id, { status: 'left', leave_reason: e.leave_reason, leave_subreason: e.leave_subreason, leave_date: e.leave_date, left_at: nowIso() });
        checkAlerts(n.school_id, n.ay, n.grade);
      }
      for (const s of all(`SELECT * FROM bus_seats WHERE child_id = ? AND status IN ('held','confirmed','waitlisted')`, e.child_id)) update('bus_seats', s.id, { status: 'released', updated_at: nowIso() });
      audit(null, 'enrolment.seat_released', 'enrolment', e.id, { status: 'leaving' }, { status: 'left' });
      checkAlerts(e.school_id, e.ay, e.grade);
    });
  }
  return due.length;
}

/* ---------------- Scheduled jobs (BR-07, BR-08, SB-06, 4.5 reminders) ---------------- */
export function runJobs() {
  const t = nowIso();
  const out = { lapsed: 0, closed: 0, leavers: 0, due_today: 0, overdue: 0, info_reminders: 0 };
  for (const a of all(`SELECT * FROM applications WHERE status = 'offer_made' AND offer_due_at < ?`, t)) {
    tx(() => {
      endWithRelease(null, a, 'lapsed', 'offer_lapsed', 'offer_not_accepted');
      notify('offer_lapsed', familyUsers(a.family_id), { ref: a.ref }, { applicationId: a.id });
    });
    out.lapsed++;
  }
  for (const a of all(`SELECT * FROM applications WHERE status = 'info_requested' AND info_due_at < ?`, t)) {
    tx(() => {
      endWithRelease(null, a, 'closed', 'closed_no_response', 'no_response');
      notify('application_closed', familyUsers(a.family_id), { ref: a.ref }, { applicationId: a.id });
    });
    out.closed++;
  }
  // reminder 2 working days before the information deadline
  for (const a of all(`SELECT * FROM applications WHERE status = 'info_requested'`)) {
    if (workingDaysBetween(t, a.info_due_at) <= 2 && !alreadySentFor('info_reminder', a.id, a.paused_at)) {
      notify('info_reminder', familyUsers(a.family_id), { ref: a.ref, due: a.info_due_at.slice(0, 10) }, { applicationId: a.id });
      out.info_reminders++;
    }
  }
  out.leavers = releaseLeavers();
  // SB-06: due today → registrar + principal; overdue → also cluster officer (once each)
  for (const a of all(`SELECT * FROM applications WHERE status IN ('submitted','under_review','passed') AND first_decision_at IS NULL AND sla_due_at IS NOT NULL`)) {
    const st = slaState(a);
    if (st === 'due_today' && !alreadySentFor('sla_due_today', a.id, a.sla_due_at)) {
      notify('sla_due_today', schoolStaff(a.current_school_id), { ref: a.ref }, { applicationId: a.id });
      out.due_today++;
    }
    if (st === 'overdue' && !alreadySentFor('sla_overdue', a.id, a.sla_due_at)) {
      notify('sla_overdue', [...schoolStaff(a.current_school_id), ...clusterOfficers(a.current_school_id)], { ref: a.ref, school: bi(school(a.current_school_id)) }, { applicationId: a.id });
      out.overdue++;
    }
  }
  return out;
}
function alreadySentFor(template, appId, since) {
  return !!get(`SELECT 1 FROM notifications WHERE template = ? AND application_id = ? AND created_at >= ? LIMIT 1`, template, appId, since ? new Date(new Date(since).getTime() - 30 * 86400000).toISOString() : '');
}

/* ---------------- Read model for screens ---------------- */
export function appView(app, { lang } = {}) {
  const child = get('SELECT * FROM children WHERE id = ?', app.child_id);
  const prefs = parse(app.preferences, []).map((id, i) => {
    const s = school(id);
    return { id, rank: i + 1, name_en: s?.name_en, name_ar: s?.name_ar, lat: s?.lat, lng: s?.lng, current: id === app.current_school_id };
  });
  const sec = app.offered_section_id ? get('SELECT * FROM sections WHERE id = ?', app.offered_section_id) : null;
  const seat = get(`SELECT b.*, r.code route_code, r.name_en route_en, r.name_ar route_ar, st.name_en stop_en, st.name_ar stop_ar, st.lat stop_lat, st.lng stop_lng
                    FROM bus_seats b JOIN transport_routes r ON r.id = b.route_id LEFT JOIN transport_stops st ON st.id = b.stop_id
                    WHERE b.application_id = ? ORDER BY b.id DESC LIMIT 1`, app.id);
  const route = !seat && app.bus_route_id ? get('SELECT code route_code, name_en route_en, name_ar route_ar FROM transport_routes WHERE id = ?', app.bus_route_id) : null;
  const cur = app.current_school_id ? school(app.current_school_id) : null;
  return {
    ...app,
    preferences: prefs,
    sibling_school_ids: parse(app.sibling_school_ids, []),
    info_request: parse(app.info_request_note, null),
    child,
    cycle: cycleOf(app.grade),
    school: cur ? { id: cur.id, name_en: cur.name_en, name_ar: cur.name_ar, lat: cur.lat, lng: cur.lng, cluster_id: cur.cluster_id } : null,
    section: sec ? { id: sec.id, name: sec.name } : null,
    bus: seat || route,
    sla: slaState(app),
    sibling_here: parse(app.sibling_school_ids, []).includes(app.current_school_id),
  };
}

export function timeline(appId) {
  return all(
    `SELECT e.*, u.name_en actor_en, u.name_ar actor_ar, u.role actor_role, s.name_en school_en, s.name_ar school_ar
       FROM application_events e LEFT JOIN users u ON u.id = e.actor_user_id LEFT JOIN schools s ON s.id = e.school_id
      WHERE e.application_id = ? ORDER BY e.at, e.id`,
    appId
  );
}

export { ayStartYear };
