import { AppError } from '../utils/errors.js';

export function requireAuth(req, _res, next) {
  if (!req.session?.userId) return next(new AppError(401, 'UNAUTHENTICATED', 'Authentication required.'));
  next();
}
