// Authentication, role-based access (TR-02) and request helpers.
import crypto from 'node:crypto';
import { get, insert, parse } from '../db/index.js';
import { AppError, nowIso } from '../services/core.js';

export const STAFF_ROLES = ['registrar', 'principal', 'cluster_officer', 'ministry_admin', 'ministry_viewer', 'transport'];

export function createSession(userId) {
  const token = crypto.randomBytes(24).toString('hex');
  insert('sessions', { token, user_id: userId, created_at: nowIso() });
  return token;
}

export function authenticate(req, _res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : req.query.token;
  if (token) {
    const s = get('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND u.active = 1', token);
    if (s) {
      req.user = s;
      req.token = token;
      if (s.role === 'parent') {
        const g = get(`SELECT * FROM guardians WHERE user_id = ? AND status = 'active' ORDER BY is_primary DESC LIMIT 1`, s.id);
        req.guardian = g || null;
        req.familyId = g?.family_id || null;
      }
    }
  }
  next();
}

export const requireAuth = (req, _res, next) => (req.user ? next() : next(new AppError(401, 'unauthenticated')));
export const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user) return next(new AppError(401, 'unauthenticated'));
  if (!roles.includes(req.user.role)) return next(new AppError(403, 'forbidden', `Requires role: ${roles.join(', ')}`));
  next();
};
// Ministry Viewers can never change data (A13)
export function readOnlyViewer(req, _res, next) {
  if (req.user?.role === 'ministry_viewer' && req.method !== 'GET') return next(new AppError(403, 'read_only_role', 'Ministry Viewers cannot change data or settings'));
  next();
}

// Can this user see this application? Parents: own family; school users: own school; cluster: own cluster.
export function canSeeApp(user, app, familyId) {
  if (!app) return false;
  switch (user.role) {
    case 'parent': return app.family_id === familyId;
    case 'registrar':
    case 'principal': return app.current_school_id === user.school_id || parse(app.preferences, []).includes(user.school_id);
    case 'cluster_officer': {
      const s = get('SELECT cluster_id FROM schools WHERE id = ?', app.current_school_id);
      return s?.cluster_id === user.cluster_id;
    }
    case 'ministry_admin':
    case 'ministry_viewer': return true;
    case 'transport': return app.transport_mode === 'bus';
    default: return false;
  }
}

export const wrap = (fn) => (req, res, next) => {
  try {
    const r = fn(req, res, next);
    if (r && typeof r.then === 'function') r.then((v) => v !== undefined && !res.headersSent && res.json(v)).catch(next);
    else if (r !== undefined && !res.headersSent) res.json(r);
  } catch (e) {
    next(e);
  }
};
