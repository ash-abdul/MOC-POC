// Sign-in. Parents: UAE PASS only (PP-01, A16) – there is deliberately no email / mobile / password route.
// Staff: demo persona picker standing in for the Ministry's single sign-on (flagged in the documentation).
import { Router } from 'express';
import { all, get, insert, update, run } from '../db/index.js';
import { nowIso, AppError, audit } from '../services/core.js';
import { uaepass } from '../mocks/index.js';
import { createSession, requireAuth, wrap, STAFF_ROLES } from './common.js';
import { notify, familyUsers } from '../services/notify.js';

const r = Router();

r.get('/uaepass/accounts', wrap(() => uaepass.testAccounts()));

r.post('/uaepass', wrap((req) => {
  const res = uaepass.authorize(req.body.emiratesId);
  if (!res.ok) throw new AppError(401, res.error, 'No UAE PASS account for this Emirates ID');
  const c = res.claims;
  let u = get('SELECT * FROM users WHERE emirates_id = ?', c.idn);
  const firstSignIn = !u;
  if (!u) {
    // PP-01: account created on first UAE PASS sign-in; identity fields come from UAE PASS and are read-only
    const id = insert('users', { role: 'parent', name_en: c.fullnameEN, name_ar: c.fullnameAR, emirates_id: c.idn, email: c.email, mobile: c.mobile, lang: req.body.lang || 'en', created_at: nowIso() });
    u = get('SELECT * FROM users WHERE id = ?', id);
    audit(u, 'user.created_from_uaepass', 'user', id, null, { emirates_id: c.idn });
  }
  if (u.role !== 'parent') throw new AppError(403, 'staff_account', 'Staff accounts use Ministry sign-in');
  const invites = all(`SELECT g.id, g.family_id, g.relationship, p.full_name_en inviter_en, p.full_name_ar inviter_ar
                         FROM guardians g JOIN guardians p ON p.family_id = g.family_id AND p.is_primary = 1
                        WHERE g.emirates_id = ? AND g.status = 'pending'`, c.idn);
  const member = get(`SELECT * FROM guardians WHERE user_id = ? AND status = 'active'`, u.id);
  let familyCreated = false;
  if (!member && !invites.length) {
    const fid = insert('families', { created_at: nowIso() });
    insert('guardians', { family_id: fid, user_id: u.id, is_primary: 1, status: 'active', emirates_id: c.idn, full_name_en: c.fullnameEN, full_name_ar: c.fullnameAR, mobile: c.mobile, email: c.email, nationality: get('SELECT nationality FROM mock_identities WHERE emirates_id = ?', c.idn)?.nationality, eid_expiry: get('SELECT eid_expiry FROM mock_identities WHERE emirates_id = ?', c.idn)?.eid_expiry, created_at: nowIso() });
    audit(u, 'family.created', 'family', fid, null, { primary_guardian: c.idn });
    familyCreated = true;
  }
  return { token: createSession(u.id), firstSignIn, familyCreated, invites, claims: c };
}));

// A16: the second guardian confirms the link after signing in with UAE PASS; Emirates IDs must match
r.post('/guardian-link/confirm', requireAuth, wrap((req) => {
  const g = get(`SELECT * FROM guardians WHERE id = ? AND status = 'pending'`, req.body.guardianId);
  if (!g) throw new AppError(404, 'invite_not_found');
  if (g.emirates_id !== req.user.emirates_id) throw new AppError(403, 'eid_mismatch', 'The Emirates ID from UAE PASS does not match the invitation');
  const solo = get(`SELECT g.family_id FROM guardians g WHERE g.user_id = ? AND g.status = 'active'`, req.user.id);
  if (solo) {
    // drop the empty family that may have been auto-created for this user
    const kids = get('SELECT COUNT(*) n FROM children WHERE family_id = ?', solo.family_id).n;
    if (!kids) { run('DELETE FROM guardians WHERE family_id = ?', solo.family_id); run('DELETE FROM families WHERE id = ?', solo.family_id); }
  }
  const ident = get('SELECT * FROM mock_identities WHERE emirates_id = ?', g.emirates_id);
  update('guardians', g.id, { status: 'active', user_id: req.user.id, full_name_en: req.user.name_en, full_name_ar: req.user.name_ar, mobile: req.user.mobile, email: req.user.email, nationality: ident?.nationality, eid_expiry: ident?.eid_expiry });
  audit(req.user, 'guardian.linked', 'guardian', g.id, { status: 'pending' }, { status: 'active', verified_by: 'UAE PASS', emirates_id: g.emirates_id });
  notify('guardian_linked', familyUsers(g.family_id).filter((u) => u.id !== req.user.id), { guardian: { en: req.user.name_en, ar: req.user.name_ar } });
  return { ok: true, familyId: g.family_id };
}));

r.get('/staff-personas', wrap(() =>
  all(`SELECT u.id, u.role, u.name_en, u.name_ar, u.email, u.force_registration, s.name_en school_en, s.name_ar school_ar, s.code school_code
         FROM users u LEFT JOIN schools s ON s.id = u.school_id
        WHERE u.role IN (${STAFF_ROLES.map(() => '?').join(',')}) AND u.active = 1 ORDER BY
        CASE u.role WHEN 'registrar' THEN 1 WHEN 'principal' THEN 2 WHEN 'cluster_officer' THEN 3 WHEN 'ministry_admin' THEN 4 WHEN 'ministry_viewer' THEN 5 ELSE 6 END, s.code`, ...STAFF_ROLES)
));

r.post('/staff', wrap((req) => {
  const u = get('SELECT * FROM users WHERE id = ? AND active = 1', req.body.userId);
  if (!u || u.role === 'parent') throw new AppError(400, 'not_staff');
  audit(u, 'user.signed_in', 'user', u.id, null, { method: 'demo_sso' });
  return { token: createSession(u.id) };
}));

r.get('/me', requireAuth, wrap((req) => {
  const u = req.user;
  const school = u.school_id ? get('SELECT id, code, name_en, name_ar, cluster_id FROM schools WHERE id = ?', u.school_id) : null;
  const cluster = u.cluster_id ? get('SELECT * FROM clusters WHERE id = ?', u.cluster_id) : null;
  const invites = u.role === 'parent' ? all(`SELECT g.id, g.family_id, g.relationship, p.full_name_en inviter_en, p.full_name_ar inviter_ar FROM guardians g JOIN guardians p ON p.family_id = g.family_id AND p.is_primary = 1 WHERE g.emirates_id = ? AND g.status = 'pending'`, u.emirates_id) : [];
  const unread = get(`SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND channel = 'inapp' AND read = 0`, u.id).n;
  return {
    id: u.id, role: u.role, name_en: u.name_en, name_ar: u.name_ar, emirates_id: u.emirates_id, email: u.email, mobile: u.mobile, lang: u.lang,
    force_registration: !!u.force_registration, school, cluster, familyId: req.familyId || null, isPrimary: !!req.guardian?.is_primary, invites, unread,
  };
}));

r.patch('/me', requireAuth, wrap((req) => {
  if (req.body.lang) update('users', req.user.id, { lang: req.body.lang === 'ar' ? 'ar' : 'en' });
  return { ok: true };
}));

r.post('/logout', requireAuth, wrap((req) => {
  run('DELETE FROM sessions WHERE token = ?', req.token);
  return { ok: true };
}));

export default r;
