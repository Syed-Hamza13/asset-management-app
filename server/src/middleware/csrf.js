import crypto from 'node:crypto';
import { AppError } from '../utils/errors.js';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

export function getCsrfToken(req) {
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  return req.session.csrfToken;
}

export function csrfProtection(req, _res, next) {
  if (SAFE.has(req.method)) return next();
  if (!req.session?.userId) return next();
  const provided = req.get('X-CSRF-Token');
  if (!provided || !req.session.csrfToken) return next(new AppError(403, 'CSRF_INVALID', 'Invalid CSRF token.'));
  const a = Buffer.from(provided);
  const b = Buffer.from(req.session.csrfToken);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return next(new AppError(403, 'CSRF_INVALID', 'Invalid CSRF token.'));
  }
  next();
}
