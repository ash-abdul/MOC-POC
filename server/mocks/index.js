// Simulated integrations (Section 8 / deliverable D4).
// Each mock exposes the interface the real integration would use, so the real adapter can be
// dropped in behind the same function signatures later. HTTP facades are mounted at /api/mock/*.
import { all, get, insert, update, parse } from '../db/index.js';
import { haversineKm, pointInGeometry, nowIso, admissionAY, currentAY } from '../services/core.js';

/* ------------------------------------------------------------------ UAE PASS
 * Real: OAuth2 / OIDC authorisation-code flow against UAE PASS (staging: stg-id.uaepass.ae).
 * Mock: the user picks one of the synthetic identities; we return the same claims the
 * userinfo endpoint returns (uuid, idn = Emirates ID, names, mobile, email). */
export const uaepass = {
  testAccounts() {
    return all(`SELECT emirates_id, name_en, name_ar, mobile, email, note FROM mock_identities
                WHERE uaepass_account = 1 ORDER BY note DESC, name_en LIMIT 60`);
  },
  authorize(emiratesId) {
    const p = get('SELECT * FROM mock_identities WHERE emirates_id = ? AND uaepass_account = 1', emiratesId);
    if (!p) return { ok: false, error: 'no_uaepass_account' };
    return {
      ok: true,
      claims: { idn: p.emirates_id, fullnameEN: p.name_en, fullnameAR: p.name_ar, mobile: p.mobile, email: p.email, nationalityEN: p.nationality, userType: 'SOP3' },
    };
  },
};

/* ------------------------------------------------------------------ Identity (ICP)
 * Real: ICP Emirates ID validation service. Mock: synthetic register + checksum-like format check. */
export const icp = {
  validate(emiratesId) {
    if (!/^784-\d{4}-\d{7}-\d$/.test(emiratesId || '')) return { valid: false, reason: 'format' };
    const p = get('SELECT * FROM mock_identities WHERE emirates_id = ?', emiratesId);
    if (!p) return { valid: false, reason: 'not_found' };
    return { valid: true, name_en: p.name_en, name_ar: p.name_ar, dob: p.dob, gender: p.gender, nationality: p.nationality, expiry: p.eid_expiry };
  },
};

/* ------------------------------------------------------------------ MoE SIS
 * Real: Student Information System API. Mock: reads the enrolments table. */
export const sis = {
  lookup(emiratesId) {
    const ay = currentAY().code;
    const row = get(
      `SELECT e.*, s.name_en school_en, s.name_ar school_ar, s.code school_code
         FROM children c JOIN enrolments e ON e.child_id = c.id JOIN schools s ON s.id = e.school_id
        WHERE c.emirates_id = ? AND e.ay = ? AND e.status IN ('enrolled','leaving') ORDER BY e.id DESC LIMIT 1`,
      emiratesId, ay
    );
    if (!row) return { enrolled: false };
    return { enrolled: true, school_id: row.school_id, school_code: row.school_code, school_en: row.school_en, school_ar: row.school_ar, grade: row.grade, last_completed_grade: prevGrade(row.grade), ay };
  },
  confirmPlacement(app, enrolmentId) {
    // Real: POST placement to SIS. Mock: record the call for traceability.
    insert('audit_log', { at: nowIso(), user_name: 'SIS mock', role: 'system', action: 'sis.placement_confirmed', entity: 'application', entity_id: String(app.id), new_value: JSON.stringify({ enrolmentId, ay: app.ay }) });
    return { ok: true, sis_reference: `SIS-${app.ay.slice(0, 4)}-${String(enrolmentId).padStart(7, '0')}` };
  },
};
const G = ['KG1', 'KG2', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'G10', 'G11', 'G12'];
const prevGrade = (g) => (G.indexOf(g) > 0 ? G[G.indexOf(g) - 1] : null);

/* ------------------------------------------------------------------ Maps
 * Real: a GIS service (e.g. Esri / Makani / Google). Mock: area polygons + catchment polygons in the DB. */
export const maps = {
  reverseGeocode(lat, lng) {
    const area = all('SELECT * FROM areas').find((a) => pointInGeometry(lat, lng, parse(a.geojson)));
    const makani = `${String(Math.round((lat % 1) * 100000)).padStart(5, '0')} ${String(Math.round((lng % 1) * 100000)).padStart(5, '0')}`;
    if (!area) return { emirate: null, area_en: null, area_ar: null, makani, covered: false };
    return { emirate: area.emirate, area_en: area.name_en, area_ar: area.name_ar, makani, covered: true };
  },
  searchArea(q) {
    const s = `%${q}%`;
    const areas = all('SELECT id, name_en, name_ar, emirate, geojson FROM areas WHERE name_en LIKE ? OR name_ar LIKE ?', s, s);
    return areas.map((a) => {
      const ring = parse(a.geojson).coordinates[0];
      const lat = ring.reduce((t, p) => t + p[1], 0) / ring.length, lng = ring.reduce((t, p) => t + p[0], 0) / ring.length;
      return { name_en: a.name_en, name_ar: a.name_ar, emirate: a.emirate, lat, lng };
    });
  },
  // Makani numbers are 10 digits "XXXXX YYYYY"; the mock decodes them back to coordinates in Sharjah.
  makani(number) {
    const m = String(number).replace(/\s/g, '').match(/^(\d{5})(\d{5})$/);
    if (!m) return null;
    return { lat: 25 + Number(m[1]) / 100000, lng: 55 + Number(m[2]) / 100000 };
  },
  catchmentsContaining(lat, lng) {
    return all('SELECT school_id, geojson FROM catchments').filter((c) => pointInGeometry(lat, lng, parse(c.geojson))).map((c) => c.school_id);
  },
  distanceKm(a, b) {
    return Math.round(haversineKm(a, b) * 10) / 10;
  },
};

/* ------------------------------------------------------------------ Transport
 * Real: MoE transport / bus routing system. Mock: routes, stops and the bus_seats table. */
export const transport = {
  routeLoad(routeId, ay = admissionAY().code) {
    const r = get('SELECT * FROM transport_routes WHERE id = ?', routeId);
    const c = get(`SELECT SUM(status='held') held, SUM(status='confirmed') confirmed, SUM(status='waitlisted') waitlisted FROM bus_seats WHERE route_id = ? AND ay = ?`, routeId, ay);
    const used = (c.held || 0) + (c.confirmed || 0);
    return { route: r, held: c.held || 0, confirmed: c.confirmed || 0, waitlisted: c.waitlisted || 0, available: r.capacity - used, status: used >= r.capacity ? 'full' : used >= r.capacity * 0.9 ? 'limited' : 'available' };
  },
  nearestStop(lat, lng, schoolId) {
    const routes = all('SELECT * FROM transport_routes').filter((r) => parse(r.school_ids, []).includes(Number(schoolId)));
    let best = null;
    for (const r of routes) {
      for (const s of all('SELECT * FROM transport_stops WHERE route_id = ?', r.id)) {
        const d = haversineKm({ lat, lng }, s);
        if (!best || d < best.distance) best = { route: r, stop: s, distance: d };
      }
    }
    if (!best || best.distance > 2.5) return { served: false };
    const load = this.routeLoad(best.route.id);
    return {
      served: true,
      route_id: best.route.id, route_code: best.route.code, route_en: best.route.name_en, route_ar: best.route.name_ar,
      stop_id: best.stop.id, stop_en: best.stop.name_en, stop_ar: best.stop.name_ar, stop_lat: best.stop.lat, stop_lng: best.stop.lng,
      walking_m: Math.round(best.distance * 1000 * 1.3),
      seat_status: load.status, seats_available: Math.max(0, load.available),
    };
  },
  // Hold a seat (BR-09) – if the route is full the request is waitlisted.
  hold({ routeId, stopId, childId, applicationId, ay }) {
    const existing = get(`SELECT * FROM bus_seats WHERE application_id = ? AND status IN ('held','confirmed','waitlisted')`, applicationId);
    if (existing) return existing;
    const load = this.routeLoad(routeId, ay);
    const status = load.available > 0 ? 'held' : 'waitlisted';
    const id = insert('bus_seats', { route_id: routeId, stop_id: stopId, child_id: childId, application_id: applicationId, ay, status, created_at: nowIso(), updated_at: nowIso() });
    return get('SELECT * FROM bus_seats WHERE id = ?', id);
  },
  confirm(applicationId) {
    const s = get(`SELECT * FROM bus_seats WHERE application_id = ? AND status IN ('held','waitlisted')`, applicationId);
    if (!s) return null;
    let status = 'confirmed';
    if (s.status === 'waitlisted' && this.routeLoad(s.route_id, s.ay).available <= 0) status = 'waitlisted';
    update('bus_seats', s.id, { status, updated_at: nowIso() });
    return { ...s, status };
  },
  release(applicationId) {
    const s = get(`SELECT * FROM bus_seats WHERE application_id = ? AND status IN ('held','confirmed','waitlisted')`, applicationId);
    if (!s) return null;
    update('bus_seats', s.id, { status: 'released', updated_at: nowIso() });
    return s;
  },
};

/* ------------------------------------------------------------------ Email & SMS
 * Real: SMTP relay / MoE notification gateway and SMS gateway.
 * Mock: messages are written to the notifications table and shown in the on-screen mock mailbox / SMS log. */
export const email = {
  send({ userId, to, subject_en, subject_ar, body_en, body_ar, template, applicationId }) {
    return insert('notifications', { user_id: userId, channel: 'email', to_address: to, subject_en, subject_ar, body_en, body_ar, template, application_id: applicationId, created_at: nowIso() });
  },
};
export const sms = {
  send({ userId, to, body_en, body_ar, template, applicationId }) {
    return insert('notifications', { user_id: userId, channel: 'sms', to_address: to, body_en, body_ar, template, application_id: applicationId, created_at: nowIso() });
  },
};
