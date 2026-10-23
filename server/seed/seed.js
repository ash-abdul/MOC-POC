// Synthetic test data generator (section 7). Deterministic: the same data is produced on every run.
//   node server/seed/seed.js
import fs from 'node:fs';
import path from 'node:path';
import { open, insert, get, all, run, update, exec, UPLOAD_DIR } from '../db/index.js';
import { clearCaches, GRADES, cycleOf, nextGrade, addWorkingDays, haversineKm, pointInGeometry } from '../services/core.js';
import { sectionSeats, gradeSeats, checkAlerts } from '../services/capacity.js';
import {
  SETTINGS, LISTS, TEMPLATES, HOLIDAYS, ACADEMIC_YEARS, WINDOWS, AREAS, SCHOOLS, ROUTES, NAMES, SPARE_CHILDREN, cell, rect, block, SUYOH,
} from './reference.js';

const T0 = Date.now();
open({ fresh: true });
const NOW = new Date();
const iso = (d) => new Date(d).toISOString();
const day = (d) => iso(d).slice(0, 10);

/* ---------- deterministic random ---------- */
let seed = 20261021;
const rnd = () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const chance = (p) => rnd() < p;
const weighted = (pairs) => {
  const tot = pairs.reduce((s, [, w]) => s + w, 0);
  let x = rnd() * tot;
  for (const [v, w] of pairs) if ((x -= w) <= 0) return v;
  return pairs[pairs.length - 1][0];
};
const between = (a, b) => new Date(new Date(a).getTime() + rnd() * (new Date(b).getTime() - new Date(a).getTime()));

/* ---------- synthetic identities ---------- */
const usedEid = new Set();
function eid(year, fixed) {
  if (fixed) { usedEid.add(fixed); return fixed; }
  let e;
  do e = `784-${year}-${String(ri(0, 9999999)).padStart(7, '0')}-${ri(0, 9)}`; while (usedEid.has(e));
  usedEid.add(e);
  return e;
}
const NAT = [['AE', 62], ['EG', 7], ['JO', 6], ['SY', 6], ['SD', 4], ['YE', 4], ['OM', 3], ['IN', 3], ['PK', 2], ['LB', 2], ['PS', 1]];
// Names follow the usual Emirati pattern: first name, father's first name, family name.
// People created with a fixed first name (the named demo personas) keep their short name unless a father is given.
function identity({ gender, family, birthYear, dob, nationality, uaepass = false, fixedEid, first, father, note, mobile, email }) {
  const g = gender || (chance(0.5) ? 'M' : 'F');
  const fn = first || pick(g === 'M' ? NAMES.male : NAMES.female);
  const fam = family || pick(NAMES.family);
  const mid = father || (first ? null : pick(NAMES.male.filter((m) => m[0] !== fn[0])));
  const birth = dob || `${birthYear ?? ri(1975, 1995)}-${String(ri(1, 12)).padStart(2, '0')}-${String(ri(1, 28)).padStart(2, '0')}`; // adult if no year given
  const p = {
    emirates_id: eid(birth.slice(0, 4), fixedEid), name_en: [fn[0], mid?.[0], fam[0]].filter(Boolean).join(' '), name_ar: [fn[1], mid?.[1], fam[1]].filter(Boolean).join(' '), dob: birth, gender: g,
    nationality: nationality || weighted(NAT), mobile: mobile || `+97150${ri(1000000, 9999999)}`,
    email: email || `${fn[0].toLowerCase()}.${fam[0].toLowerCase().replace(/[^a-z]/g, '')}${ri(1, 999)}@test.moe-poc.ae`,
    eid_expiry: `${ri(2027, 2030)}-${String(ri(1, 12)).padStart(2, '0')}-15`, uaepass_account: uaepass ? 1 : 0, note: note || null,
  };
  insert('mock_identities', p);
  return { ...p, first: fn, father: mid, family: fam };
}

/* ---------- reference data ---------- */
for (const [k, v] of Object.entries(SETTINGS)) insert('settings', { key: k, value: JSON.stringify(v), updated_at: iso(NOW) });
for (const [type, items] of Object.entries(LISTS)) items.forEach((it, i) => insert('lists', { list_type: type, code: it.code, parent_code: it.parent || null, label_en: it.en, label_ar: it.ar, sort: i }));
for (const t of TEMPLATES) insert('templates', t);
for (const [d, en, ar] of HOLIDAYS) insert('holidays', { date: d, name_en: en, name_ar: ar });
for (const y of ACADEMIC_YEARS) insert('academic_years', y);
for (const [ay, type, o, c] of WINDOWS) insert('windows', { ay, type, open_date: o, close_date: c });
clearCaches();

const clusterId = insert('clusters', { code: 'SHJ-C1', name_en: 'Sharjah Cluster 1', name_ar: 'مجمع الشارقة 1', emirate: 'SHJ' });
for (const [r, c, en, ar] of AREAS) insert('areas', { name_en: en, name_ar: ar, emirate: 'SHJ', geojson: JSON.stringify(rect(cell(r, c))) });
insert('areas', { name_en: 'Al Suyoh', name_ar: 'السيوح', emirate: 'SHJ', geojson: JSON.stringify(rect(SUYOH)) });

const center = (r, c) => (r === -1 || r === 'suyoh' ? { lat: (SUYOH.s + SUYOH.n) / 2, lng: (SUYOH.w + SUYOH.e) / 2 } : { lat: (cell(r, c).s + cell(r, c).n) / 2, lng: (cell(r, c).w + cell(r, c).e) / 2 });
const AY_PREV = '2025-26', AY_CUR = '2026-27', AY_ADM = '2027-28';

const schools = SCHOOLS.map(([code, en, ar, r, c, grades, nSec, max, cat], i) => {
  const ctr = center(r, c);
  const jitter = { lat: ctr.lat + (rnd() - 0.5) * 0.012, lng: ctr.lng + (rnd() - 0.5) * 0.012 };
  const area = r === -1 ? ['Al Suyoh', 'السيوح'] : AREAS.find((a) => a[0] === r && a[1] === c).slice(2);
  const id = insert('schools', { cluster_id: clusterId, code, name_en: en, name_ar: ar, area_en: area[0], area_ar: area[1], lat: jitter.lat, lng: jitter.lng });
  const geom = cat === 'suyoh' ? rect(SUYOH) : block(...cat);
  insert('catchments', { school_id: id, geojson: JSON.stringify(geom), updated_at: iso(NOW) });
  for (const ay of [AY_CUR, AY_ADM]) for (const g of grades) for (let s = 0; s < nSec; s++) insert('sections', { school_id: id, ay, grade: g, name: String.fromCharCode(65 + s), max_students: max });
  return { id, code, en, ar, grades, geom, ...jitter };
});
const S = Object.fromEntries(schools.map((s) => [s.code, s]));
const schoolsFor = (lat, lng, grade) => schools.filter((s) => s.grades.includes(grade) && pointInGeometry(lat, lng, s.geom));
const randomPointIn = (geom) => {
  const ring = geom.coordinates[0];
  const lngs = ring.map((p) => p[0]), lats = ring.map((p) => p[1]);
  return { lat: Math.min(...lats) + rnd() * (Math.max(...lats) - Math.min(...lats)), lng: Math.min(...lngs) + rnd() * (Math.max(...lngs) - Math.min(...lngs)) };
};

/* transport */
const routes = ROUTES.map(([code, en, ar, cap, schoolCodes, stops]) => {
  const id = insert('transport_routes', { code, name_en: en, name_ar: ar, capacity: cap, school_ids: JSON.stringify(schoolCodes.map((c) => S[c].id)) });
  const stopRows = [];
  stops.forEach((st, i) => {
    const ctr = st === 'suyoh' ? center(-1) : center(...st);
    const extra = st === 'suyoh' ? [ctr, { lat: ctr.lat + 0.012, lng: ctr.lng - 0.015 }, { lat: ctr.lat - 0.01, lng: ctr.lng + 0.012 }] : [ctr];
    extra.forEach((p, j) => {
      const areaName = st === 'suyoh' ? ['Al Suyoh', 'السيوح'] : AREAS.find((a) => a[0] === st[0] && a[1] === st[1]).slice(2);
      stopRows.push({ id: insert('transport_stops', { route_id: id, name_en: `${areaName[0]} Stop ${i + j + 1}`, name_ar: `محطة ${areaName[1]} ${i + j + 1}`, lat: p.lat, lng: p.lng }), ...p });
    });
  });
  return { id, code, cap, schoolIds: schoolCodes.map((c) => S[c].id), stops: stopRows };
});
function nearestStop(lat, lng, schoolId) {
  let best = null;
  for (const r of routes.filter((x) => x.schoolIds.includes(schoolId))) for (const s of r.stops) {
    const d = haversineKm({ lat, lng }, s);
    if (!best || d < best.d) best = { route: r, stop: s, d };
  }
  return best && best.d <= 2.5 ? best : null;
}
const routeLoad = new Map(routes.map((r) => [r.id, 0]));
const waitCount = {};

/* ---------- staff users & personas ---------- */
const user = (o) => insert('users', { lang: 'en', created_at: iso(NOW), ...o });
const staff = {};
for (const s of schools) {
  const reg = identity({ gender: 'F', uaepass: false, birthYear: ri(1975, 1995) });
  const pri = identity({ gender: chance(0.5) ? 'M' : 'F', birthYear: ri(1965, 1985) });
  staff[`reg_${s.code}`] = user({ role: 'registrar', name_en: reg.name_en, name_ar: reg.name_ar, email: `registrar.${s.code.toLowerCase()}@moe-poc.ae`, school_id: s.id });
  staff[`pri_${s.code}`] = user({ role: 'principal', name_en: `Dr. ${pri.name_en}`, name_ar: `د. ${pri.name_ar}`, email: `principal.${s.code.toLowerCase()}@moe-poc.ae`, school_id: s.id });
}
user({ role: 'cluster_officer', name_en: 'Saeed Al Nuaimi', name_ar: 'سعيد النعيمي', email: 'cluster.officer@moe-poc.ae', cluster_id: clusterId });
user({ role: 'ministry_admin', name_en: 'Hessa Al Marzouqi', name_ar: 'حصة المرزوقي', email: 'hessa.admin@moe-poc.ae', force_registration: 1 });
user({ role: 'ministry_admin', name_en: 'Omar Haddad', name_ar: 'عمر حداد', email: 'omar.admin@moe-poc.ae', force_registration: 0 });
user({ role: 'ministry_viewer', name_en: 'Laila Ibrahim', name_ar: 'ليلى إبراهيم', email: 'laila.viewer@moe-poc.ae' });
user({ role: 'transport', name_en: 'Yaqoub Al Shamsi', name_ar: 'يعقوب الشامسي', email: 'transport@moe-poc.ae' });

/* ---------- placeholder documents (one synthetic PDF per document type) ---------- */
function pdf(text) {
  const content = `BT /F1 18 Tf 60 760 Td (MoE Registration PoC - SYNTHETIC DOCUMENT) Tj 0 -40 Td /F1 14 Tf (${text}) Tj 0 -30 Td (Not a real document. Generated test data.) Tj ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF`;
  return out;
}
fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
for (const d of LISTS.doc_type) fs.writeFileSync(path.join(UPLOAD_DIR, `sample-${d.code}.pdf`), pdf(d.en.replace(/[()']/g, '')));
function doc(o) {
  const size = fs.statSync(path.join(UPLOAD_DIR, `sample-${o.doc_type}.pdf`)).size;
  const { at, ...rest } = o;
  return insert('documents', { filename: `${o.doc_type}.pdf`, mime: 'application/pdf', size, storage_path: `sample-${o.doc_type}.pdf`, status: 'accepted', uploaded_at: iso(at || NOW), ...rest });
}

/* ---------- children helper ---------- */
function makeChild({ familyId = null, family, father, grade, ay = AY_CUR, nationality, sod, dob, first, gender, fixedEid, schooling, lastCompleted }) {
  // age on 31 Dec of AY start year: KG1 = 4 ... G12 = 17
  const startYear = Number(ay.slice(0, 4));
  const birthYear = startYear - (4 + GRADES.indexOf(grade));
  const p = identity({ family, father, birthYear, dob, nationality, first, gender, fixedEid });
  const id = insert('children', {
    family_id: familyId, emirates_id: p.emirates_id, full_name_en: p.name_en, full_name_ar: p.name_ar, dob: p.dob, gender: p.gender,
    nationality: p.nationality, passport_no: p.nationality === 'AE' ? null : `P${ri(1000000, 9999999)}`,
    schooling_status: schooling || 'moe', last_completed_grade: lastCompleted ?? null, sod: sod ?? (chance(0.03) ? 1 : 0), created_at: iso(NOW),
  });
  return { id, ...p };
}

/* ---------- current enrolments (AY 2026-27) and seats held for renewal (AY 2027-28) ---------- */
const FILL = { 'SHJ-S12': [0.96, 1.0] };
const enrolCurrent = [];
const sectionsOf = (schoolId, ay, grade) => all('SELECT * FROM sections WHERE school_id = ? AND ay = ? AND grade = ? ORDER BY name', schoolId, ay, grade);
for (const s of schools) {
  for (const g of s.grades) {
    for (const sec of sectionsOf(s.id, AY_CUR, g)) {
      const [lo, hi] = FILL[s.code] || [0.72, 0.95];
      const n = Math.round(sec.max_students * (lo + rnd() * (hi - lo)));
      for (let i = 0; i < n; i++) {
        const ch = makeChild({ grade: g, ay: AY_CUR, lastCompleted: GRADES[GRADES.indexOf(g) - 1] || null });
        const eId = insert('enrolments', { child_id: ch.id, school_id: s.id, ay: AY_CUR, grade: g, section_id: sec.id, status: 'enrolled', source: 'seed', start_date: '2026-08-24', created_at: iso(NOW) });
        enrolCurrent.push({ eId, childId: ch.id, school: s, grade: g, section: sec.name, gender: ch.gender });
      }
    }
  }
}
// promote to next year where the same school offers the next grade → seat held until renewal
const pendingByChild = new Map();
for (const e of enrolCurrent) {
  const ng = nextGrade(e.grade);
  if (!ng) continue;
  if (!e.school.grades.includes(ng)) continue;
  const secs = sectionsOf(e.school.id, AY_ADM, ng);
  const sec = secs.find((x) => x.name === e.section) || secs[0];
  const id = insert('enrolments', { child_id: e.childId, school_id: e.school.id, ay: AY_ADM, grade: ng, section_id: sec.id, status: 'pending_renewal', source: 'seed', created_at: iso(NOW) });
  pendingByChild.set(e.childId, id);
}

/* ---------- leavers: ≥40 in the current year (all reasons) + previous year history ---------- */
const SUBS = { private_school: ['fees', 'quality', 'distance', 'facilities', 'ps_other'], other_emirate: ['oe_relocation', 'oe_work', 'oe_other'], outside_uae: ['ou_relocation', 'ou_residence_end', 'ou_other'], home_schooling: ['hs_health', 'hs_choice', 'hs_other'], other: [null] };
const REASONS = [['private_school', 40], ['other_emirate', 20], ['outside_uae', 22], ['home_schooling', 8], ['other', 10]];
const leaverPool = enrolCurrent.filter((e) => e.school.code !== 'SHJ-S12').sort(() => rnd() - 0.5);
let li = 0;
for (let i = 0; i < 52; i++) {
  const e = leaverPool[li++];
  const reason = i < 10 ? REASONS[i % 5][0] : weighted(REASONS);
  const sub = pick(SUBS[reason]);
  const future = i >= 48; // a few confirmed leavers whose seat is released later
  const leaveDate = future ? day(new Date(NOW.getTime() + ri(3, 20) * 86400000)) : day(between('2026-08-26', new Date(NOW.getTime() - 86400000)));
  update('enrolments', e.eId, {
    status: future ? 'leaving' : 'left', leave_reason: reason, leave_subreason: sub, leave_note: reason === 'other' ? pick(['Medical treatment abroad', 'Family circumstances', 'Joined a specialised centre']) : null,
    leave_date: leaveDate, leave_destination: reason === 'private_school' ? pick(['Private school, Sharjah', 'Private school, Dubai']) : null, left_at: future ? null : iso(leaveDate), leave_requested_at: iso(new Date(new Date(leaveDate).getTime() - 7 * 86400000)),
  });
  if (!future && pendingByChild.has(e.childId)) update('enrolments', pendingByChild.get(e.childId), { status: 'left', leave_reason: reason, leave_subreason: sub, leave_date: leaveDate, left_at: iso(leaveDate) });
}
// pending leaving requests from parents waiting for school confirmation are created with the demo families below
// previous-year leavers (history for comparisons)
for (let i = 0; i < 64; i++) {
  const s = pick(schools), g = pick(s.grades);
  const ch = makeChild({ grade: g, ay: AY_PREV });
  const reason = weighted(REASONS);
  const ld = day(between('2025-09-01', '2026-06-30'));
  insert('enrolments', { child_id: ch.id, school_id: s.id, ay: AY_PREV, grade: g, status: 'left', source: 'seed', leave_reason: reason, leave_subreason: pick(SUBS[reason]), leave_date: ld, left_at: iso(ld), created_at: iso(NOW) });
}

/* ---------- applications ---------- */
let refSeq = { 2025: 0, 2026: 0 };
const refFor = (submitted) => {
  const y = new Date(submitted).getUTCFullYear();
  refSeq[y] = (refSeq[y] || 0) + 1;
  return `ADM-${y}-SHJ-${String(refSeq[y]).padStart(6, '0')}`;
};
function ev(appId, at, action, status, actor = null, note = null, schoolId = null) {
  insert('application_events', { application_id: appId, at: iso(at), action, status, actor_user_id: actor, school_id: schoolId, note });
}
const PATHWAYS = { new: ['new', 'new'], private: ['transfer', 'private'], other_emirate: ['transfer', 'other_emirate'], abroad: ['transfer', 'abroad'], moe_transfer: ['transfer', 'moe_transfer'] };

/* Create an application with a consistent history of events up to `status`. */
function createApp({ child, familyId = null, ay, grade, pathway, status, submitted, home, prefs, prefIndex = 0, transportMode, volume = 1, sod, escalation, exceptional, exceptionalReason, residence = 'own', siblingIds = [], slaOverride }) {
  const [type, pw] = PATHWAYS[pathway] || ['renewal', 'renewal'];
  const sub = new Date(submitted);
  const slaDue = slaOverride || addWorkingDays(sub, 2);
  const cur = prefs[Math.min(prefIndex, prefs.length - 1)];
  const reg = staff[`reg_${schools.find((s) => s.id === cur).code}`];
  const a = {
    ref: status === 'draft' ? null : refFor(sub), child_id: child.id, family_id: familyId, ay, type, pathway: pw, grade, status,
    preferences: JSON.stringify(prefs), pref_index: prefIndex, current_school_id: cur, home_lat: home.lat, home_lng: home.lng,
    transport_mode: transportMode, declarations: status === 'draft' ? 0 : 1, submitted_at: status === 'draft' ? null : iso(sub),
    sla_due_at: status === 'draft' || escalation ? null : slaDue, created_at: iso(new Date(sub.getTime() - 3600000)), updated_at: iso(sub),
    is_synthetic_volume: volume, escalation_reason: escalation || null, cluster_review: escalation ? 1 : 0, exceptional: exceptional ? 1 : 0,
    exceptional_reason: exceptionalReason || null, residence_route: residence, sibling_school_ids: JSON.stringify(siblingIds),
    out_of_catchment: escalation === 'out_of_catchment' ? 1 : 0,
  };
  if (transportMode === 'bus') {
    const ns = nearestStop(home.lat, home.lng, cur);
    if (ns) { a.bus_route_id = ns.route.id; a.bus_stop_id = ns.stop.id; } else a.transport_mode = 'dropoff';
  }
  const decided = new Date(sub.getTime() + rnd() * (NOW - sub < 5 * 86400000 ? 0.8 : 2.6) * 86400000 + 3600000);
  const capped = (d) => (d > NOW ? new Date(NOW.getTime() - 3600000) : d);
  if (['offer_made', 'accepted', 'rejected', 'lapsed', 'withdrawn', 'passed', 'info_requested'].includes(status) || (status === 'escalated' && !escalation)) a.first_decision_at = iso(capped(decided));
  if (status === 'info_requested') {
    a.first_decision_at = null; a.paused_at = iso(capped(decided)); a.info_due_at = addWorkingDays(capped(decided), 5);
    a.info_request_note = JSON.stringify({ reason: pick(['missing_document', 'unclear_document', 'address_verification']), note: '', docTypes: ['utility_bill'] });
  }
  if (status === 'escalated' && !escalation) a.escalation_reason = 'no_seat';
  const id = insert('applications', a);
  if (status === 'draft') return { id, ...a };
  ev(id, sub, 'submitted', 'submitted', null, a.escalation_reason ? `escalation:${a.escalation_reason}` : null, cur);
  if (a.bus_route_id) {
    const willHold = ['submitted', 'under_review', 'info_requested', 'passed', 'escalated', 'offer_made', 'accepted'].includes(status) && ay === AY_ADM;
    if (willHold) {
      const load = routeLoad.get(a.bus_route_id);
      const route = routes.find((r) => r.id === a.bus_route_id);
      // keep spare seats on every route except R4 (the full route in section 7)
      if ((route.code !== 'R4' && load >= Math.floor(route.cap * 0.75)) || (route.code === 'R4' && load >= route.cap && (waitCount.R4 = (waitCount.R4 || 0) + 1) > 6)) {
        update('applications', id, { transport_mode: 'dropoff', bus_route_id: null, bus_stop_id: null });
        a.bus_route_id = null;
      }
      const st = load < route.cap ? (status === 'accepted' ? 'confirmed' : 'held') : 'waitlisted';
      if (st !== 'waitlisted') routeLoad.set(a.bus_route_id, load + 1);
      if (a.bus_route_id) insert('bus_seats', { route_id: a.bus_route_id, stop_id: a.bus_stop_id, child_id: child.id, application_id: id, ay, status: st, created_at: iso(sub), updated_at: iso(sub) });
    }
  }
  if (status === 'submitted') return { id, ...a };
  const t1 = new Date(Math.min(sub.getTime() + 3 * 3600000, NOW.getTime() - 60000));
  if (status !== 'escalated' || !escalation) ev(id, t1, 'review_started', 'under_review', reg, null, cur);
  if (status === 'under_review') return { id, ...a };
  if (status === 'info_requested') { ev(id, a.paused_at, 'info_requested', 'info_requested', reg, null, cur); ev(id, a.paused_at, 'sla_paused', 'info_requested', null, null, cur); return { id, ...a }; }
  if (status === 'passed') { ev(id, a.first_decision_at, 'passed', 'passed', reg, null, cur); return { id, ...a }; }
  if (status === 'escalated') { if (!escalation) ev(id, a.first_decision_at, 'auto_escalated', 'escalated', null, null, cur); return { id, ...a }; }
  if (status === 'rejected') {
    update('applications', id, { end_reason: pick(['not_eligible_age', 'outside_catchment', 'duplicate', 'false_information']), decided_at: a.first_decision_at });
    ev(id, a.first_decision_at, 'rejected', 'rejected', reg, null, cur);
    return { id, ...a };
  }
  if (status === 'withdrawn' && chance(0.5)) { ev(id, a.first_decision_at, 'withdrawn', 'withdrawn', null, null, cur); update('applications', id, { end_reason: 'parent_withdrew', first_decision_at: null }); return { id, ...a }; }
  // offer path
  const seat = ay === AY_ADM ? sectionSeats(cur, ay, grade).filter((x) => x.available > 0).sort((x, y) => y.available - x.available)[0] : sectionsOf(cur, ay, grade)[0];
  if (!seat) {
    update('applications', id, { status: 'escalated', escalation_reason: 'no_seat' });
    ev(id, a.first_decision_at, 'auto_escalated', 'escalated', null, null, cur);
    return { id, ...a, status: 'escalated' };
  }
  const offerDue = addWorkingDays(a.first_decision_at, 5);
  update('applications', id, { offered_section_id: seat.id, offer_due_at: offerDue, decided_at: a.first_decision_at });
  ev(id, a.first_decision_at, 'offer_made', 'offer_made', reg, `${grade}-${seat.name}`, cur);
  if (status === 'offer_made') return { id, ...a };
  const acc = capped(new Date(new Date(a.first_decision_at).getTime() + rnd() * 3 * 86400000));
  if (status === 'accepted') {
    update('applications', id, { decided_at: iso(acc) });
    ev(id, acc, 'accepted', 'accepted', null, null, cur);
    if (ay === AY_ADM) {
      insert('enrolments', { child_id: child.id, school_id: cur, ay, grade, section_id: seat.id, status: 'enrolled', source: type, application_id: id, start_date: '2027-08-23', created_at: iso(acc) });
    }
  } else if (status === 'lapsed') {
    ev(id, offerDue, 'offer_lapsed', 'lapsed', null, null, cur);
    update('applications', id, { end_reason: 'offer_not_accepted', decided_at: offerDue });
  } else if (status === 'withdrawn') {
    ev(id, acc, 'offer_declined', 'withdrawn', null, null, cur);
    update('applications', id, { end_reason: 'offer_declined', decided_at: iso(acc) });
  }
  return { id, ...a };
}

// open states must be recent enough to be valid today (offers / info requests not yet expired; most queue items within SLA)
function submittedFor(status, from, to) {
  const hrs = (h) => new Date(NOW.getTime() - h * 3600000);
  if (['submitted', 'under_review', 'passed'].includes(status)) return chance(0.88) ? between(hrs(40), hrs(1)) : between(hrs(24 * 9), hrs(24 * 3));
  if (['offer_made', 'info_requested'].includes(status)) return between(hrs(24 * 4), hrs(50));
  return between(from, to);
}
const GRADE_MIX = [['KG1', 40], ['KG2', 6], ['G1', 16], ['G2', 3], ['G3', 3], ['G4', 2], ['G5', 9], ['G6', 2], ['G7', 2], ['G8', 2], ['G9', 8], ['G10', 3], ['G11', 2], ['G12', 1]];
const PATH_MIX = (g) => (g === 'KG1' ? [['new', 90], ['private', 6], ['abroad', 4]] : [['new', 12], ['private', 38], ['other_emirate', 18], ['abroad', 14], ['moe_transfer', 18]]);
function volumeApp({ ay, submittedFrom, submittedTo, statusMix }) {
  const grade = weighted(GRADE_MIX);
  const offering = schools.filter((s) => s.grades.includes(grade) && s.code !== 'SHJ-S12');
  const first = pick(offering);
  const home = randomPointIn(first.geom);
  const options = schoolsFor(home.lat, home.lng, grade).filter((s) => s.code !== 'SHJ-S12');
  const prefs = [first, ...options.filter((s) => s.id !== first.id).sort(() => rnd() - 0.5)].slice(0, ri(1, 3)).map((s) => s.id);
  const pathway = weighted(PATH_MIX(grade));
  const child = makeChild({ grade, ay, schooling: pathway === 'new' ? 'none' : pathway, lastCompleted: GRADES[GRADES.indexOf(grade) - 1] || null });
  let status = weighted(statusMix);
  const submitted = ay === AY_ADM ? submittedFor(status, submittedFrom, submittedTo) : between(submittedFrom, submittedTo);
  // applications submitted in the last 2 days cannot yet be decided
  if (ay === AY_ADM && NOW - submitted < 2 * 86400000 && !['submitted', 'under_review'].includes(status)) status = 'submitted';
  return createApp({ child, ay, grade, pathway, status, submitted, home, prefs, transportMode: weighted([['bus', 35], ['dropoff', 45], ['private', 12], ['walk', 8]]) });
}

// previous cycle (AY 2026-27 admissions, submitted Sep 2025 – May 2026): all decided
for (let i = 0; i < 2900; i++) volumeApp({ ay: AY_CUR, submittedFrom: '2025-09-15', submittedTo: chance(0.62) ? '2025-10-31' : '2026-05-31', statusMix: [['accepted', 66], ['rejected', 9], ['withdrawn', 9], ['lapsed', 6], ['offer_made', 0], ['closed', 0]] });
// previous-year renewals (history for IR-02)
for (let i = 0; i < 260; i++) {
  const e = pick(enrolCurrent);
  const ref = refFor(between('2025-10-01', '2025-12-31'));
  const at = between('2025-10-01', '2025-12-31');
  insert('applications', { ref, child_id: e.childId, ay: AY_CUR, type: 'renewal', pathway: 'renewal', grade: e.grade, status: 'accepted', preferences: JSON.stringify([e.school.id]), current_school_id: e.school.id, submitted_at: iso(at), first_decision_at: iso(at), decided_at: iso(at), declarations: 1, created_at: iso(at), updated_at: iso(at), is_synthetic_volume: 1 });
}
// current cycle (AY 2027-28, new-registration window opened 15 Sep 2026)
const curFrom = '2026-09-15', curTo = iso(new Date(NOW.getTime() - 3600000));
for (let i = 0; i < 1500; i++) volumeApp({ ay: AY_ADM, submittedFrom: curFrom, submittedTo: curTo, statusMix: [['submitted', 14], ['under_review', 18], ['info_requested', 5], ['passed', 3], ['escalated', 3], ['offer_made', 13], ['accepted', 30], ['rejected', 6], ['withdrawn', 5], ['lapsed', 3]] });
// current-cycle renewals already confirmed (renewal window opened 1 Oct 2026)
const renewNow = enrolCurrent.filter((e) => pendingByChild.has(e.childId)).sort(() => rnd() - 0.5).slice(0, 260);
for (const e of renewNow) {
  const pid = pendingByChild.get(e.childId);
  if (get('SELECT status FROM enrolments WHERE id = ?', pid).status !== 'pending_renewal') continue;
  const at = between('2026-10-01', curTo);
  const id = insert('applications', { ref: refFor(at), child_id: e.childId, ay: AY_ADM, type: 'renewal', pathway: 'renewal', grade: nextGrade(e.grade), status: 'accepted', preferences: JSON.stringify([e.school.id]), current_school_id: e.school.id, submitted_at: iso(at), first_decision_at: iso(at), decided_at: iso(at), declarations: 1, created_at: iso(at), updated_at: iso(at), is_synthetic_volume: 1, renewal_of_enrolment_id: pid });
  update('enrolments', pid, { status: 'enrolled', source: 'renewal', application_id: id });
  ev(id, at, 'renewed', 'accepted');
}

/* ---------- 200 demo families / 350 children with full profiles ---------- */
const fam = [];
function makeFamily({ home, primary, second, sole = false, areaName, emergency }) {
  const fid = insert('families', {
    home_lat: home.lat, home_lng: home.lng, emirate: 'SHJ', area_en: areaName?.[0], area_ar: areaName?.[1],
    makani: `${String(Math.round((home.lat % 1) * 100000)).padStart(5, '0')} ${String(Math.round((home.lng % 1) * 100000)).padStart(5, '0')}`,
    residence_confirmed: 1, sole_custody: sole ? 1 : 0, emergency_name: emergency?.[0] || 'Mohammed Saleh', emergency_relationship: emergency?.[1] || 'uncle', emergency_mobile: '+971501112233', created_at: iso(NOW),
  });
  const addG = (p, isPrimary, rel) => {
    const uid = user({ role: 'parent', name_en: p.name_en, name_ar: p.name_ar, emirates_id: p.emirates_id, email: p.email, mobile: p.mobile });
    insert('guardians', { family_id: fid, user_id: uid, is_primary: isPrimary ? 1 : 0, status: 'active', emirates_id: p.emirates_id, eid_expiry: p.eid_expiry, full_name_en: p.name_en, full_name_ar: p.name_ar, nationality: p.nationality, mobile: p.mobile, email: p.email, relationship: rel, preferred_channel: 'email', created_at: iso(NOW) });
    doc({ family_id: fid, doc_type: 'guardian_eid', expiry_date: p.eid_expiry });
    if (p.nationality !== 'AE') doc({ family_id: fid, doc_type: 'guardian_passport', expiry_date: '2031-01-01' });
    return uid;
  };
  const puid = addG(primary, true, primary.gender === 'M' ? 'father' : 'mother');
  if (second) addG(second, false, second.gender === 'M' ? 'father' : 'mother');
  doc({ family_id: fid, doc_type: 'tenancy', ref_number: `TC-${ri(100000, 999999)}`, expiry_date: '2027-12-31' });
  doc({ family_id: fid, doc_type: 'utility_bill', ref_number: `SEWA-${ri(1000000, 9999999)}`, issue_date: day(new Date(NOW.getTime() - ri(10, 70) * 86400000)) });
  if (sole) doc({ family_id: fid, doc_type: 'custody_order' });
  return { fid, puid };
}
function childDocs(fid, ch, pathway) {
  doc({ family_id: fid, child_id: ch.id, doc_type: 'child_eid', expiry_date: ch.eid_expiry });
  if (ch.nationality !== 'AE') doc({ family_id: fid, child_id: ch.id, doc_type: 'child_passport', expiry_date: '2031-06-30' });
  if (pathway !== 'other_emirate' && pathway !== 'moe_transfer') { doc({ family_id: fid, child_id: ch.id, doc_type: 'birth_certificate' }); doc({ family_id: fid, child_id: ch.id, doc_type: 'child_photo' }); }
  if (pathway === 'new' || pathway === 'abroad') doc({ family_id: fid, child_id: ch.id, doc_type: 'vaccination' });
  if (pathway === 'private' || pathway === 'abroad') { doc({ family_id: fid, child_id: ch.id, doc_type: 'school_reports' }); doc({ family_id: fid, child_id: ch.id, doc_type: 'transfer_certificate' }); }
  if (pathway === 'abroad') doc({ family_id: fid, child_id: ch.id, doc_type: 'equivalency' });
  if (ch.sod) doc({ family_id: fid, child_id: ch.id, doc_type: 'sod_reports' });
}
const areaAt = (lat, lng) => {
  const a = AREAS.find(([r, c]) => pointInGeometry(lat, lng, rect(cell(r, c))));
  return a ? [a[2], a[3]] : ['Al Suyoh', 'السيوح'];
};
function attachEnrolledChild(fid, family, home, father) {
  // move a background current student into this family (sibling / renewal / leaver scenarios)
  const options = enrolCurrent.filter((e) => !e.taken && e.school.code !== 'SHJ-S12' && pointInGeometry(home.lat, home.lng, e.school.geom) && get('SELECT status FROM enrolments WHERE id = ?', e.eId).status === 'enrolled');
  const e = options.length ? pick(options) : null;
  if (!e) return null;
  e.taken = true;
  // rename the student into this family and keep the identity register (ICP / UAE PASS mock) in step
  const kid = get('SELECT * FROM children WHERE id = ?', e.childId);
  const fn = pick(kid.gender === 'M' ? NAMES.male : NAMES.female);
  const mid = father || pick(NAMES.male);
  const name_en = `${fn[0]} ${mid[0]} ${family[0]}`, name_ar = `${fn[1]} ${mid[1]} ${family[1]}`;
  run('UPDATE children SET family_id = ?, full_name_en = ?, full_name_ar = ? WHERE id = ?', fid, name_en, name_ar, e.childId);
  run('UPDATE mock_identities SET name_en = ?, name_ar = ? WHERE emirates_id = ?', name_en, name_ar, kid.emirates_id);
  const ch = get('SELECT * FROM children WHERE id = ?', e.childId);
  doc({ family_id: fid, child_id: ch.id, doc_type: 'child_eid', expiry_date: '2029-05-01' });
  return { ...e, child: ch };
}

/* ----- named personas used in the acceptance scenarios ----- */
// A1 / A16: new parent without a family account yet, plus the second guardian
const fatima = identity({ gender: 'F', first: ['Fatima', 'فاطمة'], family: ['Al Mansoori', 'المنصوري'], nationality: 'AE', uaepass: true, fixedEid: '784-1990-1234567-1', note: 'A1/A16 new parent (no family yet)', email: 'fatima.almansoori@test.moe-poc.ae', mobile: '+971501234567', dob: '1990-04-12' });
identity({ gender: 'M', first: ['Khalid', 'خالد'], family: ['Al Mansoori', 'المنصوري'], nationality: 'AE', uaepass: true, fixedEid: '784-1987-7654321-2', note: 'A16 second guardian (to be linked)', email: 'khalid.almansoori@test.moe-poc.ae', mobile: '+971507654321', dob: '1987-09-03' });
identity({ gender: 'F', first: ['Mariam', 'مريم'], family: ['Al Mansoori', 'المنصوري'], nationality: 'AE', fixedEid: '784-2023-1111111-1', dob: '2023-05-10', note: 'A1 child – eligible KG1 AY 2027-28' });

// A2 / A3 / A9 / A10: Ahmed Al Hashimi – Al Nahda
const nahdaHome = { lat: 25.3165, lng: 55.4262 };
const ahmed = identity({ gender: 'M', first: ['Ahmed', 'أحمد'], family: ['Al Hashimi', 'الهاشمي'], nationality: 'AE', uaepass: true, fixedEid: '784-1985-2222222-2', note: 'A2/A3/A9/A10 existing family', email: 'ahmed.alhashimi@test.moe-poc.ae', mobile: '+971502222222', dob: '1985-02-20' });
const huda = identity({ gender: 'F', first: ['Huda', 'هدى'], family: ['Al Hashimi', 'الهاشمي'], nationality: 'AE', uaepass: true, fixedEid: '784-1988-3333333-3', note: 'Second guardian (linked) – cannot withdraw', email: 'huda.alhashimi@test.moe-poc.ae', mobile: '+971503333333', dob: '1988-07-14' });
const H = makeFamily({ home: nahdaHome, primary: ahmed, second: huda, areaName: ['Al Nahda', 'النهدة'], emergency: ['Saif Al Hashimi', 'uncle'] });
// Omar: current student G3 at Al Taawun Primary (S04) – renewal / move scenario (A9) and sibling (A10)
const omarE = enrolCurrent.find((e) => e.school.code === 'SHJ-S04' && e.grade === 'G3' && !e.taken);
omarE.taken = true;
run(`UPDATE children SET family_id = ?, full_name_en = 'Omar Al Hashimi', full_name_ar = 'عمر الهاشمي', gender = 'M', nationality = 'AE', passport_no = NULL WHERE id = ?`, H.fid, omarE.childId);
run(`UPDATE mock_identities SET name_en = 'Omar Al Hashimi', name_ar = 'عمر الهاشمي', gender = 'M', nationality = 'AE' WHERE emirates_id = (SELECT emirates_id FROM children WHERE id = ?)`, omarE.childId);
if (get('SELECT status FROM enrolments WHERE id = ?', pendingByChild.get(omarE.childId))?.status !== 'pending_renewal') update('enrolments', pendingByChild.get(omarE.childId), { status: 'pending_renewal' });
// Layla: KG1 application submitted to Al Majaz KG (S01) – school offers, parent accepts (A2)
const layla = makeChild({ familyId: H.fid, grade: 'KG1', ay: AY_ADM, first: ['Layla', 'ليلى'], family: ['Al Hashimi', 'الهاشمي'], gender: 'F', nationality: 'AE', sod: 0, fixedEid: '784-2023-4444444-4', dob: '2023-03-08', schooling: 'none' });
childDocs(H.fid, layla, 'new');
const laylaApp = createApp({ child: layla, familyId: H.fid, ay: AY_ADM, grade: 'KG1', pathway: 'new', status: 'submitted', submitted: new Date(NOW.getTime() - 26 * 3600000), home: nahdaHome, prefs: [S['SHJ-S01'].id, S['SHJ-S04'].id, S['SHJ-S02'].id], transportMode: 'bus', volume: 0, siblingIds: [S['SHJ-S04'].id] });
// Yousef: newborn sibling identity in ICP – the parent adds him live (A10)
identity({ gender: 'M', first: ['Yousef', 'يوسف'], family: ['Al Hashimi', 'الهاشمي'], nationality: 'AE', fixedEid: '784-2023-5555555-5', dob: '2023-11-02', note: 'A10 sibling to add (KG1)' });

// A3: Noura Al Zaabi – application waiting at S01 for an information request
const noura = identity({ gender: 'F', first: ['Noura', 'نورة'], family: ['Al Zaabi', 'الزعابي'], nationality: 'AE', uaepass: true, fixedEid: '784-1989-6666666-6', note: 'A3 information request', email: 'noura.alzaabi@test.moe-poc.ae', dob: '1989-01-30' });
const nHome = { lat: 25.3402, lng: 55.3955 };
const N = makeFamily({ home: nHome, primary: noura, areaName: ['Al Majaz', 'المجاز'], sole: true });
const hamad = makeChild({ familyId: N.fid, grade: 'KG1', ay: AY_ADM, first: ['Hamad', 'حمد'], family: ['Al Zaabi', 'الزعابي'], gender: 'M', nationality: 'AE', fixedEid: '784-2023-6767676-7', dob: '2023-06-21', schooling: 'none' });
childDocs(N.fid, hamad, 'new');
createApp({ child: hamad, familyId: N.fid, ay: AY_ADM, grade: 'KG1', pathway: 'new', status: 'under_review', submitted: new Date(NOW.getTime() - 20 * 3600000), home: nHome, prefs: [S['SHJ-S01'].id, S['SHJ-S03'].id], transportMode: 'dropoff', volume: 0 });

// A5: Sara Al Suwaidi – lives in Al Suyoh where the only school is full
const sara = identity({ gender: 'F', first: ['Sara', 'سارة'], family: ['Al Suwaidi', 'السويدي'], nationality: 'AE', uaepass: true, fixedEid: '784-1992-7777777-7', note: 'A5 no seat in catchment (Al Suyoh)', email: 'sara.alsuwaidi@test.moe-poc.ae', dob: '1992-12-01' });
const suyohHome = { lat: 25.2352, lng: 55.5431 };
const SA = makeFamily({ home: suyohHome, primary: sara, areaName: ['Al Suyoh', 'السيوح'] });
const rawda = makeChild({ familyId: SA.fid, grade: 'KG1', ay: AY_ADM, first: ['Rawda', 'روضة'], family: ['Al Suwaidi', 'السويدي'], gender: 'F', nationality: 'AE', fixedEid: '784-2023-7878787-8', dob: '2023-02-14', schooling: 'none' });
childDocs(SA.fid, rawda, 'new');

// A11 / A14: Rashid Al Ketbi – one child leaving the network, one exceptional transfer
const rashid = identity({ gender: 'M', first: ['Rashid', 'راشد'], family: ['Al Ketbi', 'الكتبي'], nationality: 'AE', uaepass: true, fixedEid: '784-1980-8888888-8', note: 'A11 leaving / A14 exceptional transfer', email: 'rashid.alketbi@test.moe-poc.ae', dob: '1980-05-05' });
const kHome = { lat: 25.3125, lng: 55.3955 };
const KT = makeFamily({ home: kHome, primary: rashid, areaName: ['Al Taawun', 'التعاون'] });
for (const [first, sch, gr] of [[['Sultan', 'سلطان'], 'SHJ-S07', 'G7'], [['Hessa', 'حصة'], 'SHJ-S04', 'G4']]) {
  const e = enrolCurrent.find((x) => x.school.code === sch && x.grade === gr && !x.taken && get('SELECT status FROM enrolments WHERE id = ?', x.eId).status === 'enrolled');
  e.taken = true;
  run(`UPDATE children SET family_id = ?, full_name_en = ?, full_name_ar = ?, nationality = 'AE', passport_no = NULL, gender = ? WHERE id = ?`, KT.fid, `${first[0]} Al Ketbi`, `${first[1]} الكتبي`, first[0] === 'Sultan' ? 'M' : 'F', e.childId);
  run(`UPDATE mock_identities SET name_en = ?, name_ar = ?, nationality = 'AE', gender = ? WHERE emirates_id = (SELECT emirates_id FROM children WHERE id = ?)`, `${first[0]} Al Ketbi`, `${first[1]} الكتبي`, first[0] === 'Sultan' ? 'M' : 'F', e.childId);
}

// spare children in the identity register for testing "Add a child" (documented on the PoC page)
for (const [eidv, en, ar, dobv, g, nat, note] of SPARE_CHILDREN) {
  usedEid.add(eidv);
  insert('mock_identities', { emirates_id: eidv, name_en: en, name_ar: ar, dob: dobv, gender: g, nationality: nat, eid_expiry: '2030-06-30', uaepass_account: 0, note });
}

// A6: two applications competing for the last KG1 seat at Al Qasimia Primary (S03)
const raceKids = [];
for (const [first, g, home] of [[['Zayed', 'زايد'], 'M', { lat: 25.3455, lng: 55.4105 }], [['Maitha', 'ميثاء'], 'F', { lat: 25.3448, lng: 55.4012 }]]) {
  const p = identity({ gender: g === 'M' ? 'F' : 'M', family: pick(NAMES.family), nationality: 'AE', uaepass: true, birthYear: ri(1980, 1994) });
  const F = makeFamily({ home, primary: p, areaName: areaAt(home.lat, home.lng) });
  const ch = makeChild({ familyId: F.fid, grade: 'KG1', ay: AY_ADM, first, family: p.family, gender: g, nationality: 'AE', sod: 0, schooling: 'none' });
  childDocs(F.fid, ch, 'new');
  raceKids.push(createApp({ child: ch, familyId: F.fid, ay: AY_ADM, grade: 'KG1', pathway: 'new', status: 'under_review', submitted: new Date(NOW.getTime() - (30 - raceKids.length) * 3600000), home, prefs: [S['SHJ-S03'].id, S['SHJ-S01'].id], transportMode: 'dropoff', volume: 0 }));
}
// A7: escalated application waiting at the full Al Suyoh KG1 grade (force registration)
{
  const p = identity({ gender: 'M', first: ['Majid', 'ماجد'], family: ['Al Kaabi', 'الكعبي'], nationality: 'AE', uaepass: true, birthYear: ri(1980, 1994) });
  const home = { lat: 25.2401, lng: 55.5502 };
  const F = makeFamily({ home, primary: p, areaName: ['Al Suyoh', 'السيوح'] });
  const ch = makeChild({ familyId: F.fid, grade: 'KG1', ay: AY_ADM, first: ['Hamdan', 'حمدان'], family: ['Al Kaabi', 'الكعبي'], gender: 'M', nationality: 'AE', schooling: 'none', sod: 1 });
  childDocs(F.fid, ch, 'new');
  createApp({ child: ch, familyId: F.fid, ay: AY_ADM, grade: 'KG1', pathway: 'new', status: 'escalated', submitted: new Date(NOW.getTime() - 50 * 3600000), home, prefs: [S['SHJ-S12'].id], transportMode: 'bus', volume: 0, escalation: null });
}
// A8: an application at Al Majaz KG2 (89%) – one offer crosses the 90% threshold
{
  const p = identity({ gender: 'F', family: ['Al Shamsi', 'الشامسي'], nationality: 'AE', uaepass: true, birthYear: ri(1980, 1994) });
  const home = { lat: 25.3381, lng: 55.3901 };
  const F = makeFamily({ home, primary: p, areaName: ['Al Majaz', 'المجاز'] });
  const ch = makeChild({ familyId: F.fid, grade: 'KG2', ay: AY_ADM, first: ['Salem', 'سالم'], family: ['Al Shamsi', 'الشامسي'], gender: 'M', nationality: 'AE', schooling: 'private', lastCompleted: 'KG1' });
  childDocs(F.fid, ch, 'private');
  createApp({ child: ch, familyId: F.fid, ay: AY_ADM, grade: 'KG2', pathway: 'private', status: 'submitted', submitted: new Date(NOW.getTime() - 5 * 3600000), home, prefs: [S['SHJ-S01'].id], transportMode: 'dropoff', volume: 0 });
}

// remaining demo families up to 200 / 350 children across all grades and pathways
let childCount = 0;
for (const f of all('SELECT id FROM families')) childCount += get('SELECT COUNT(*) n FROM children WHERE family_id = ?', f.id).n;
let famCount = get('SELECT COUNT(*) n FROM families').n;
const familyStatusMix = [['draft', 6], ['submitted', 14], ['under_review', 16], ['info_requested', 6], ['passed', 3], ['escalated', 3], ['offer_made', 14], ['accepted', 26], ['rejected', 5], ['withdrawn', 4], ['lapsed', 3]];
const pendingLeaveRequests = [];
while (famCount < 200) {
  const r = ri(0, 2), c = ri(0, 3);
  const home = randomPointIn(rect(cell(r, c)));
  const famName = pick(NAMES.family);
  const nat = weighted(NAT);
  const p1 = identity({ gender: chance(0.6) ? 'M' : 'F', family: famName, nationality: nat, uaepass: true, birthYear: ri(1975, 1995) });
  const sole = chance(0.06);
  const p2 = sole ? null : identity({ gender: p1.gender === 'M' ? 'F' : 'M', family: famName, nationality: nat, uaepass: true, birthYear: ri(1975, 1995) });
  const F = makeFamily({ home, primary: p1, second: p2, sole, areaName: areaAt(home.lat, home.lng) });
  // children carry their father's first name (or a deceased / absent father's name for sole custody)
  const father = p1.gender === 'M' ? p1.first : p2?.gender === 'M' ? p2.first : pick(NAMES.male);
  famCount++;
  const kids = childCount < 354 ? (famCount % 3 === 0 ? 3 : famCount % 3 === 1 ? 2 : 1) : 1;
  for (let k = 0; k < kids && childCount < 354; k++) {
    childCount++;
    if (k === 0 && chance(0.45)) {
      // current student – renewal pending, some already renewed, some leaving requests
      const e = attachEnrolledChild(F.fid, famName, home, father);
      if (e && chance(0.2)) pendingLeaveRequests.push({ e, fid: F.fid, puid: F.puid });
      if (e) continue;
    }
    const grade = weighted(GRADE_MIX);
    const pathway = weighted(PATH_MIX(grade));
    const options = schoolsFor(home.lat, home.lng, grade).filter((s) => s.code !== 'SHJ-S12');
    const ch = makeChild({ familyId: F.fid, family: famName, father, grade, ay: AY_ADM, nationality: nat, sod: chance(0.07) ? 1 : 0, schooling: pathway === 'new' ? 'none' : pathway, lastCompleted: pathway === 'new' ? null : GRADES[GRADES.indexOf(grade) - 1] || null });
    childDocs(F.fid, ch, pathway);
    if (!options.length) continue;
    const prefs = options.sort(() => rnd() - 0.5).slice(0, ri(1, 3)).map((s) => s.id);
    let status = weighted(familyStatusMix);
    const submitted = submittedFor(status, curFrom, curTo);
    if (NOW - submitted < 2 * 86400000 && !['submitted', 'under_review', 'draft'].includes(status)) status = 'submitted';
    const sibs = all(`SELECT DISTINCT e.school_id FROM enrolments e JOIN children c ON c.id = e.child_id WHERE c.family_id = ? AND e.ay IN (?, ?) AND e.status IN ('enrolled','pending_renewal')`, F.fid, AY_CUR, AY_ADM).map((x) => x.school_id);
    createApp({ child: ch, familyId: F.fid, ay: AY_ADM, grade, pathway, status, submitted, home, prefs, transportMode: weighted([['bus', 40], ['dropoff', 45], ['walk', 7], ['private', 8]]), volume: 0, siblingIds: sibs, residence: chance(0.04) ? 'relatives' : 'own' });
  }
}
// parents' leaving requests awaiting school confirmation (PP-21 / SB-08)
for (const { e, puid } of pendingLeaveRequests.slice(0, 12)) {
  const reason = weighted(REASONS);
  update('enrolments', e.eId, { leave_requested_at: iso(between('2026-10-05', curTo)), leave_requested_by: puid, leave_reason: reason, leave_subreason: pick(SUBS[reason]), leave_note: reason === 'other' ? 'Family circumstances' : null, leave_date: day(new Date(NOW.getTime() + ri(5, 40) * 86400000)) });
}

/* ---------- capacity calibration (section 7 capacity cases) ---------- */
function setUsed(code, grade, target) {
  const sid = S[code].id;
  let g = gradeSeats(sid, AY_ADM, grade);
  // remove surplus pending renewals (they become leavers) or add accepted placements to hit the target exactly
  while (g.used > target) {
    const e = get(`SELECT e.id FROM enrolments e WHERE e.school_id = ? AND e.ay = ? AND e.grade = ? AND e.status IN ('pending_renewal','enrolled') AND e.application_id IS NULL ORDER BY e.id DESC LIMIT 1`, sid, AY_ADM, grade)
      || get(`SELECT e.id FROM enrolments e JOIN applications a ON a.id = e.application_id WHERE e.school_id = ? AND e.ay = ? AND e.grade = ? AND e.status = 'enrolled' AND a.is_synthetic_volume = 1 ORDER BY e.id DESC LIMIT 1`, sid, AY_ADM, grade);
    if (!e) {
      const o = get(`SELECT a.id FROM applications a JOIN sections s ON s.id = a.offered_section_id WHERE s.school_id = ? AND s.ay = ? AND s.grade = ? AND a.status = 'offer_made' AND a.is_synthetic_volume = 1 LIMIT 1`, sid, AY_ADM, grade);
      if (!o) break;
      update('applications', o.id, { status: 'withdrawn', end_reason: 'offer_declined' });
    } else update('enrolments', e.id, { status: 'left', leave_reason: 'transfer_out', leave_date: '2026-09-30', left_at: '2026-09-30T08:00:00Z' });
    g = gradeSeats(sid, AY_ADM, grade);
  }
  while (g.used < target) {
    const sec = g.sections.filter((x) => x.available > 0).sort((a, b) => b.available - a.available)[0];
    const home = randomPointIn(S[code].geom);
    const ch = makeChild({ grade, ay: AY_ADM, schooling: 'none' });
    const at = between(curFrom, new Date(NOW.getTime() - 3 * 86400000));
    const app = createApp({ child: ch, ay: AY_ADM, grade, pathway: grade === 'KG1' ? 'new' : 'private', status: 'submitted', submitted: at, home, prefs: [sid], transportMode: 'dropoff' });
    const dec = new Date(at.getTime() + 86400000);
    update('applications', app.id, { status: 'accepted', offered_section_id: sec.id, first_decision_at: iso(dec), decided_at: iso(dec) });
    ev(app.id, dec, 'offer_made', 'offer_made', staff[`reg_${code}`], `${grade}-${sec.name}`, sid);
    ev(app.id, dec, 'accepted', 'accepted', null, null, sid);
    insert('enrolments', { child_id: ch.id, school_id: sid, ay: AY_ADM, grade, section_id: sec.id, status: 'enrolled', source: 'new', application_id: app.id, start_date: '2027-08-23', created_at: iso(dec) });
    g = gradeSeats(sid, AY_ADM, grade);
  }
}
const capOf = (code, grade) => gradeSeats(S[code].id, AY_ADM, grade).capacity;
setUsed('SHJ-S12', 'KG1', capOf('SHJ-S12', 'KG1'));                // 100% – grade closed
setUsed('SHJ-S03', 'KG1', capOf('SHJ-S03', 'KG1') - 1);            // 99% – one seat left (A6)
setUsed('SHJ-S01', 'KG2', Math.round(capOf('SHJ-S01', 'KG2') * 0.89)); // 89% (A8)
setUsed('SHJ-S06', 'G1', Math.round(capOf('SHJ-S06', 'G1') * 0.93));   // a standing 90% alert
setUsed('SHJ-S01', 'KG1', Math.min(gradeSeats(S['SHJ-S01'].id, AY_ADM, 'KG1').used, capOf('SHJ-S01', 'KG1') - 12)); // keep seats for demos
setUsed('SHJ-S04', 'KG1', Math.min(gradeSeats(S['SHJ-S04'].id, AY_ADM, 'KG1').used, capOf('SHJ-S04', 'KG1') - 10));
setUsed('SHJ-S02', 'KG1', Math.min(gradeSeats(S['SHJ-S02'].id, AY_ADM, 'KG1').used, capOf('SHJ-S02', 'KG1') - 10));
// Al Suyoh only school is full for the demo grades → "area served by no school with a free seat"
setUsed('SHJ-S12', 'G1', capOf('SHJ-S12', 'G1'));
// at the 99% grade only the two A6 applications are still waiting; earlier applicants moved on
for (const a of all(`SELECT * FROM applications WHERE current_school_id = ? AND ay = ? AND grade = 'KG1' AND status IN ('submitted','under_review','passed','info_requested')`, S['SHJ-S03'].id, AY_ADM)) {
  if (raceKids.some((k) => k.id === a.id)) continue;
  const prefs = JSON.parse(a.preferences);
  const at = iso(new Date(NOW.getTime() - 6 * 3600000));
  if (prefs.length > a.pref_index + 1) {
    update('applications', a.id, { status: 'passed', pref_index: a.pref_index + 1, current_school_id: prefs[a.pref_index + 1], first_decision_at: a.first_decision_at || at, paused_at: null, info_due_at: null, sla_due_at: addWorkingDays(at, 2) });
    ev(a.id, at, 'auto_passed', 'passed', null, 'Grade reached 99% capacity', S['SHJ-S03'].id);
  } else {
    update('applications', a.id, { status: 'escalated', escalation_reason: 'no_seat', first_decision_at: a.first_decision_at || at, paused_at: null, info_due_at: null });
    ev(a.id, at, 'auto_escalated', 'escalated', null, null, S['SHJ-S03'].id);
  }
}
// the two A6 applications must still be waiting; the A7 one must stay escalated
for (const k of raceKids) update('applications', k.id, { status: 'under_review', current_school_id: S['SHJ-S03'].id, pref_index: 0 });
update('applications', laylaApp.id, { status: 'submitted' });

// route R4 is full (section 7 transport case)
{
  const r4 = routes.find((r) => r.code === 'R4');
  let load = get(`SELECT COUNT(*) n FROM bus_seats WHERE route_id = ? AND ay = ? AND status IN ('held','confirmed')`, r4.id, AY_ADM).n;
  while (load < r4.cap) {
    const e = pick(enrolCurrent.filter((x) => r4.schoolIds.includes(x.school.id)));
    insert('bus_seats', { route_id: r4.id, stop_id: pick(r4.stops).id, child_id: e.childId, ay: AY_ADM, status: 'confirmed', created_at: iso(NOW), updated_at: iso(NOW) });
    load++;
  }
  for (let i = 0; i < 7; i++) {
    const e = pick(enrolCurrent.filter((x) => r4.schoolIds.includes(x.school.id)));
    insert('bus_seats', { route_id: r4.id, stop_id: pick(r4.stops).id, child_id: e.childId, ay: AY_ADM, status: 'waitlisted', created_at: iso(NOW), updated_at: iso(NOW) });
  }
}

/* ---------- alerts with backdated threshold dates ---------- */
clearCaches();
for (const s of schools) for (const ay of [AY_CUR, AY_ADM]) for (const g of s.grades) checkAlerts(s.id, ay, g);
for (const a of all('SELECT id FROM capacity_alerts')) update('capacity_alerts', a.id, { reached_at: iso(between('2026-09-20', new Date(NOW.getTime() - 86400000))) });
run(`DELETE FROM notifications`); // alert emails generated during seeding are not part of the demo inbox

// renewal window notification for families of current students (4.5)
for (const f of all(`SELECT DISTINCT c.family_id, c.full_name_en, c.full_name_ar FROM children c JOIN enrolments e ON e.child_id = c.id WHERE c.family_id IS NOT NULL AND e.ay = ? AND e.status = 'pending_renewal'`, AY_ADM)) {
  for (const g of all(`SELECT u.* FROM guardians g JOIN users u ON u.id = g.user_id WHERE g.family_id = ?`, f.family_id)) {
    insert('notifications', { user_id: g.id, channel: 'inapp', template: 'renewal_window_open', subject_en: 'Renewal window is open', subject_ar: 'فترة تجديد التسجيل مفتوحة', body_en: `Please confirm the place of ${f.full_name_en} for next academic year in the portal.`, body_ar: `يرجى تأكيد مقعد ${f.full_name_ar} للعام الدراسي القادم عبر البوابة.`, created_at: '2026-10-01T05:00:00.000Z' });
  }
}
// the renewal-window messages for the starting admission year were created above
insert('audit_log', { at: '2026-10-01T05:00:00.000Z', user_name: 'System', role: 'system', action: 'renewal.window_notified', entity: 'academic_year', entity_id: AY_ADM, new_value: JSON.stringify({ seeded: true }) });
insert('audit_log', { at: iso(NOW), user_name: 'System', role: 'system', action: 'seed.completed', entity: 'database', new_value: JSON.stringify({ seed }) });

const count = (t, w = '') => get(`SELECT COUNT(*) n FROM ${t} ${w}`).n;
console.log({
  schools: count('schools'), families: count('families'), demo_children: count('children', 'WHERE family_id IS NOT NULL'), children_total: count('children'),
  applications: count('applications'), current_cycle_apps: count('applications', `WHERE ay = '${AY_ADM}'`),
  enrolled_current: count('enrolments', `WHERE ay = '${AY_CUR}' AND status IN ('enrolled','leaving')`),
  leavers_current: count('enrolments', `WHERE ay = '${AY_CUR}' AND status IN ('left','leaving') AND leave_reason NOT IN ('transfer_out')`),
  alerts: count('capacity_alerts', 'WHERE cleared_at IS NULL'), documents: count('documents'),
  S12_KG1: gradeSeats(S['SHJ-S12'].id, AY_ADM, 'KG1').utilisation, S03_KG1: gradeSeats(S['SHJ-S03'].id, AY_ADM, 'KG1').available, S01_KG2: gradeSeats(S['SHJ-S01'].id, AY_ADM, 'KG2').utilisation,
  ms: Date.now() - T0,
});
exec('PRAGMA wal_checkpoint(TRUNCATE)');
