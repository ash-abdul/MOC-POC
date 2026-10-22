// Notifications (section 4.5): bilingual templates (AD-05) rendered to in-portal, email and SMS (simulated).
import { all, get, insert } from '../db/index.js';
import { nowIso } from './core.js';
import { email, sms } from '../mocks/index.js';

const fill = (s, vars) => String(s || '').replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] ?? ''));

// vars may hold {en, ar} pairs for values that differ by language (e.g. school names)
function render(tpl, vars, lang) {
  const v = Object.fromEntries(Object.entries(vars).map(([k, x]) => [k, x && typeof x === 'object' ? x[lang] : x]));
  return { subject: fill(tpl[`subject_${lang}`], v), body: fill(tpl[`body_${lang}`], v) };
}

/**
 * @param {string} key template key
 * @param {object[]} users recipient user rows
 * @param {object} vars template variables
 * @param {{applicationId?:number, channels?:string[], toEmails?:string[]}} opts
 */
export function notify(key, users, vars = {}, opts = {}) {
  const tpl = get('SELECT * FROM templates WHERE key = ?', key);
  if (!tpl) return;
  const en = render(tpl, vars, 'en'), ar = render(tpl, vars, 'ar');
  const channels = opts.channels || ['inapp', 'email'];
  const seen = new Set();
  for (const u of users.filter(Boolean)) {
    if (seen.has(u.id)) continue;
    seen.add(u.id);
    const base = { userId: u.id, subject_en: en.subject, subject_ar: ar.subject, body_en: en.body, body_ar: ar.body, template: key, applicationId: opts.applicationId };
    if (channels.includes('inapp')) {
      insert('notifications', { user_id: u.id, channel: 'inapp', template: key, subject_en: en.subject, subject_ar: ar.subject, body_en: en.body, body_ar: ar.body, application_id: opts.applicationId ?? null, created_at: nowIso() });
    }
    if (channels.includes('email') && u.email) email.send({ ...base, to: u.email });
    if (channels.includes('sms') && u.mobile) sms.send({ ...base, to: u.mobile });
  }
}

// Has this template already been sent for this application (used for once-only reminders)?
export const alreadySent = (key, applicationId) =>
  !!get(`SELECT 1 FROM notifications WHERE template = ? AND application_id = ? LIMIT 1`, key, applicationId);

/* ---------- recipient helpers ---------- */
export const familyUsers = (familyId) =>
  all(`SELECT u.* FROM guardians g JOIN users u ON u.id = g.user_id WHERE g.family_id = ? AND g.status = 'active'`, familyId);
export const schoolStaff = (schoolId, roles = ['registrar', 'principal']) =>
  all(`SELECT * FROM users WHERE school_id = ? AND active = 1 AND role IN (${roles.map(() => '?').join(',')})`, schoolId, ...roles);
export const clusterOfficers = (schoolId) =>
  all(`SELECT u.* FROM users u JOIN schools s ON s.cluster_id = u.cluster_id WHERE s.id = ? AND u.role = 'cluster_officer' AND u.active = 1`, schoolId);
export const ministryAdmins = () => all(`SELECT * FROM users WHERE role = 'ministry_admin' AND active = 1`);
export const ministryViewers = () => all(`SELECT * FROM users WHERE role = 'ministry_viewer' AND active = 1`);
export const transportCoordinators = () => all(`SELECT * FROM users WHERE role = 'transport' AND active = 1`);
