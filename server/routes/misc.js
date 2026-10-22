// Insights, transport coordinator, notifications, lookups, i18n and mock-service facades.
import { Router } from 'express';
import { all, get, update, parse } from '../db/index.js';
import { AppError, audit, admissionAY, currentAY, windowStatus, setting, nowIso, today, GRADES, CYCLES, eligibleGrade, clockOffsetDays } from '../services/core.js';
import { REPORTS, normFilters, dashboard } from '../services/reports.js';
import { exportXlsx } from '../services/excel.js';
import { dict } from '../services/i18n.js';
import { icp, sis, maps, transport, uaepass } from '../mocks/index.js';
import { notify, familyUsers } from '../services/notify.js';
import { requireAuth, requireRole, wrap } from './common.js';

export const reports = Router();
const INSIGHT_ROLES = ['principal', 'cluster_officer', 'ministry_admin', 'ministry_viewer', 'transport'];
reports.use(requireAuth, requireRole(...INSIGHT_ROLES));
reports.get('/dashboard', wrap((req) => dashboard(req.user)));
reports.get('/:id', wrap((req) => {
  const fn = REPORTS[req.params.id];
  if (!fn) throw new AppError(404, 'unknown_report');
  const f = normFilters(req.query, req.user);
  return { id: req.params.id, filters: f, generated_at: nowIso(), ...fn(f) };
}));
reports.get('/:id/export', wrap(async (req, res) => {
  const fn = REPORTS[req.params.id];
  if (!fn) throw new AppError(404, 'unknown_report');
  const f = normFilters(req.query, req.user);
  const out = fn(f);
  const flt = Object.entries(f).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join('  ');
  audit(req.user, 'report.exported', 'report', req.params.id, null, f);
  await exportXlsx(res, { name: req.params.id, lang: req.query.lang, columns: out.columns, rows: out.rows, totals: out.totals, titleKey: `report.${req.params.id}`, subtitle: `${req.params.id}  ${flt}  ·  ${nowIso().slice(0, 16)}` });
}));

/* Transport coordinator */
export const transportRouter = Router();
transportRouter.use(requireAuth);
transportRouter.get('/routes', requireRole('transport', 'ministry_admin', 'ministry_viewer'), wrap((req) => {
  const ay = req.query.ay || admissionAY().code;
  return all('SELECT * FROM transport_routes ORDER BY code').map((r) => ({
    ...transport.routeLoad(r.id, ay), ...r, school_ids: parse(r.school_ids, []),
    schools: all(`SELECT id, name_en, name_ar FROM schools WHERE id IN (${parse(r.school_ids, []).join(',') || 0})`),
    stops: all('SELECT * FROM transport_stops WHERE route_id = ?', r.id),
  }));
}));
transportRouter.put('/routes/:id', requireRole('transport'), wrap((req) => {
  const r = get('SELECT * FROM transport_routes WHERE id = ?', req.params.id);
  const cap = Number(req.body.capacity);
  if (!r || !(cap > 0)) throw new AppError(400, 'bad_request');
  update('transport_routes', r.id, { capacity: cap });
  audit(req.user, 'transport.route_capacity', 'route', r.code, { capacity: r.capacity }, { capacity: cap });
  return { ok: true };
}));
transportRouter.get('/requests', requireRole('transport', 'ministry_admin', 'ministry_viewer'), wrap((req) => {
  const w = ['b.ay = ?'], p = [req.query.ay || admissionAY().code];
  if (req.query.route) { w.push('b.route_id = ?'); p.push(Number(req.query.route)); }
  if (req.query.status) { w.push('b.status = ?'); p.push(req.query.status); }
  else w.push(`b.status != 'released'`);
  return all(`SELECT b.*, r.code route_code, st.name_en stop_en, st.name_ar stop_ar, c.full_name_en child_en, c.full_name_ar child_ar, a.ref, a.status app_status, a.grade, s.name_en school_en, s.name_ar school_ar
                FROM bus_seats b JOIN transport_routes r ON r.id = b.route_id LEFT JOIN transport_stops st ON st.id = b.stop_id JOIN children c ON c.id = b.child_id
                LEFT JOIN applications a ON a.id = b.application_id LEFT JOIN schools s ON s.id = a.current_school_id
               WHERE ${w.join(' AND ')} ORDER BY b.status = 'waitlisted' DESC, b.created_at LIMIT 1000`, ...p);
}));
// confirm a held seat, or promote a waitlisted request when a seat is free
transportRouter.post('/seats/:id/confirm', requireRole('transport'), wrap((req) => {
  const s = get('SELECT * FROM bus_seats WHERE id = ?', req.params.id);
  if (!s || !['held', 'waitlisted'].includes(s.status)) throw new AppError(409, 'bad_state');
  if (s.status === 'waitlisted' && transport.routeLoad(s.route_id, s.ay).available <= 0) throw new AppError(409, 'route_full', 'Route is full – increase capacity first');
  update('bus_seats', s.id, { status: 'confirmed', updated_at: nowIso() });
  audit(req.user, 'transport.seat_confirmed', 'bus_seat', s.id, { status: s.status }, { status: 'confirmed' });
  const app = s.application_id && get('SELECT * FROM applications WHERE id = ?', s.application_id);
  const child = get('SELECT * FROM children WHERE id = ?', s.child_id);
  if (app?.family_id) notify('bus_confirmed', familyUsers(app.family_id), { ref: app.ref, child: { en: child.full_name_en, ar: child.full_name_ar } }, { applicationId: app.id });
  return { ok: true };
}));

/* Notifications (in-portal) */
export const notifications = Router();
notifications.use(requireAuth);
notifications.get('/', wrap((req) => all(`SELECT * FROM notifications WHERE user_id = ? AND channel = 'inapp' ORDER BY id DESC LIMIT 100`, req.user.id)));
notifications.post('/read', wrap((req) => {
  update('notifications', req.user.id, { read: 1 }, 'user_id');
  return { ok: true };
}));

/* Lookups used by every screen */
export const lookups = Router();
lookups.get('/', wrap(() => {
  const ay = admissionAY();
  return {
    grades: GRADES, cycles: CYCLES, current_ay: currentAY(), admission_ay: ay, academic_years: all('SELECT * FROM academic_years ORDER BY code'),
    windows: { new: windowStatus(ay.code, 'new'), renewal: windowStatus(ay.code, 'renewal'), transfer: windowStatus(ay.code, 'transfer') },
    schools: all('SELECT id, code, name_en, name_ar, area_en, area_ar, lat, lng, cluster_id FROM schools ORDER BY code'),
    clusters: all('SELECT * FROM clusters'),
    lists: all('SELECT list_type, code, parent_code, label_en, label_ar FROM lists WHERE active = 1 ORDER BY list_type, sort, id'),
    settings: { max_preferences: setting('max_preferences'), max_file_mb: setting('max_file_mb'), allowed_file_types: setting('allowed_file_types'), capacity_warning_threshold: setting('capacity_warning_threshold'), priority_order: setting('priority_order'), utility_bill_max_age_months: setting('utility_bill_max_age_months') },
    today: today(), clock_offset_days: clockOffsetDays(),
  };
}));
lookups.get('/catchments', wrap(() => all('SELECT c.school_id, c.geojson, s.name_en, s.name_ar, s.code FROM catchments c JOIN schools s ON s.id = c.school_id').map((c) => ({ ...c, geojson: parse(c.geojson) }))));
lookups.get('/areas', wrap(() => all('SELECT name_en, name_ar, geojson FROM areas').map((a) => ({ ...a, geojson: parse(a.geojson) }))));
lookups.get('/i18n/:lang', wrap((req) => dict(req.params.lang === 'ar' ? 'ar' : 'en')));
lookups.get('/eligible-grade', wrap((req) => eligibleGrade({ dob: req.query.dob, lastCompletedGrade: req.query.last, pathway: req.query.pathway || 'new' })));

/* Mock services (D4): HTTP facades with the same interface the real integrations would expose,
 * plus the demo mailbox / SMS log. */
export const mock = Router();
mock.get('/uaepass/accounts', wrap(() => uaepass.testAccounts()));
mock.get('/icp/:eid', wrap((req) => icp.validate(req.params.eid)));
mock.get('/sis/:eid', wrap((req) => sis.lookup(req.params.eid)));
mock.get('/maps/reverse', wrap((req) => ({ ...maps.reverseGeocode(Number(req.query.lat), Number(req.query.lng)), catchments: maps.catchmentsContaining(Number(req.query.lat), Number(req.query.lng)) })));
mock.get('/maps/search', wrap((req) => maps.searchArea(String(req.query.q || ''))));
mock.get('/maps/makani/:n', wrap((req) => maps.makani(req.params.n) || {}));
mock.get('/transport/nearest', wrap((req) => transport.nearestStop(Number(req.query.lat), Number(req.query.lng), Number(req.query.schoolId))));
mock.get('/outbox', requireAuth, wrap((req) => {
  const channel = req.query.channel === 'sms' ? 'sms' : 'email';
  const mine = req.query.scope === 'mine' || req.user.role === 'parent';
  return all(`SELECT n.*, u.name_en user_en, u.name_ar user_ar, u.role FROM notifications n LEFT JOIN users u ON u.id = n.user_id
               WHERE n.channel = ? ${mine ? 'AND n.user_id = ' + Number(req.user.id) : ''} ORDER BY n.id DESC LIMIT 300`, channel);
}));
