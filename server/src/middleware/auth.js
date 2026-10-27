import { pool } from '../config/db.js';
import { AppError } from '../utils/errors.js';

export function requireAuth(req, _res, next) {
  if (!req.session?.userId) return next(new AppError(401, 'UNAUTHENTICATED', 'Authentication required.'));
  next();
}

// Loads the user's role/permissions on every request so that deactivation and
// permission changes take effect immediately, without waiting for re-login.
export async function loadUser(req, res, next) {
  if (!req.session?.userId) return next(new AppError(401, 'UNAUTHENTICATED', 'Authentication required.'));
  try {
    const [rows] = await pool.execute(
      'SELECT id, email, role, is_active, must_change_password FROM users WHERE id = ? LIMIT 1',
      [req.session.userId],
    );
    if (!rows.length || !rows[0].is_active) {
      await new Promise((resolve) => req.session.destroy(() => resolve()));
      res.clearCookie('sid');
      return next(new AppError(401, 'UNAUTHENTICATED', 'Authentication required.'));
    }
    const user = rows[0];
    let permissions = [];
    if (user.role !== 'admin') {
      const [permRows] = await pool.execute('SELECT capability FROM user_permissions WHERE user_id = ?', [user.id]);
      permissions = permRows.map((row) => row.capability);
    }
    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      isAdmin: user.role === 'admin',
      permissions,
      mustChangePassword: Boolean(user.must_change_password),
    };
    next();
  } catch (error) {
    next(error);
  }
}

// Grants access when the user holds ANY of the listed capabilities.
// Admins always pass.
export function requirePermission(...capabilities) {
  return (req, _res, next) => {
    if (!req.user) return next(new AppError(401, 'UNAUTHENTICATED', 'Authentication required.'));
    if (req.user.isAdmin) return next();
    if (capabilities.some((capability) => req.user.permissions.includes(capability))) return next();
    next(new AppError(403, 'FORBIDDEN', 'You do not have permission to perform this action.'));
  };
}

export function requireAdmin(req, _res, next) {
  if (!req.user?.isAdmin) return next(new AppError(403, 'FORBIDDEN', 'Admin access required.'));
  next();
}
