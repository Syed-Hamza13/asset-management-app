import { z } from 'zod';
import { authenticate, changePassword } from './service.js';
import { AppError, asyncHandler } from '../../utils/errors.js';
import { verifyTurnstile } from '../setup/turnstile.js';
import { getCsrfToken } from '../../middleware/csrf.js';

const loginSchema = z.object({ email: z.string().email().max(255), password: z.string().min(1).max(200), turnstileToken: z.string().min(1) });
const passwordSchema = z.object({ currentPassword: z.string().min(1).max(200), newPassword: z.string().min(10).max(200), confirmPassword: z.string().min(10).max(200) });

export const login = asyncHandler(async (req, res) => {
  const data = loginSchema.parse(req.body);
  const [turnstileOk, user] = await Promise.all([verifyTurnstile(data.turnstileToken, req.ip), authenticate(data.email.toLowerCase(), data.password)]);
  if (!turnstileOk || !user) throw new AppError(401, 'LOGIN_FAILED', 'Invalid login credentials or verification.');
  await new Promise((resolve, reject) => req.session.regenerate((error) => error ? reject(error) : resolve()));
  req.session.userId = user.id;
  req.session.email = user.email;
  req.session.csrfToken = getCsrfToken(req);
  res.json({ success: true, data: { user: { id: user.id, email: user.email } } });
});

export const me = asyncHandler(async (req, res) => res.json({ success: true, data: { user: { id: req.session.userId, email: req.session.email }, csrfToken: getCsrfToken(req) } }));
export const csrf = asyncHandler(async (req, res) => res.json({ success: true, data: { csrfToken: getCsrfToken(req) } }));
export const logout = asyncHandler(async (req, res) => {
  await new Promise((resolve, reject) => req.session.destroy((error) => error ? reject(error) : resolve()));
  res.clearCookie('sid');
  res.json({ success: true });
});
export const updatePassword = asyncHandler(async (req, res) => {
  const data = passwordSchema.parse(req.body);
  if (data.newPassword !== data.confirmPassword) throw new AppError(400, 'PASSWORD_MISMATCH', 'Passwords do not match.');
  await changePassword(req.session.userId, data.currentPassword, data.newPassword);
  await new Promise((resolve, reject) => req.session.regenerate((error) => error ? reject(error) : resolve()));
  req.session.userId = undefined;
  req.session.email = undefined;
  res.json({ success: true, data: { requiresLogin: true } });
});
