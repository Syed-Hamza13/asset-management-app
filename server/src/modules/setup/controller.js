import { z } from 'zod';
import { createAdmin, countUsers } from '../auth/service.js';
import { AppError, asyncHandler } from '../../utils/errors.js';
import { verifyTurnstile } from './turnstile.js';

const schema = z.object({ email: z.string().email().max(255), password: z.string().min(10).max(200), confirmPassword: z.string().min(10).max(200), turnstileToken: z.string().min(1) });

export const setupStatus = asyncHandler(async (_req, res) => {
  res.json({ success: true, data: { setupRequired: (await countUsers()) === 0 } });
});

export const setupAdmin = asyncHandler(async (req, res) => {
  const data = schema.parse(req.body);
  if (data.password !== data.confirmPassword) throw new AppError(400, 'PASSWORD_MISMATCH', 'Passwords do not match.');
  if (!(await verifyTurnstile(data.turnstileToken, req.ip))) throw new AppError(400, 'TURNSTILE_FAILED', 'Turnstile verification failed.');
  const admin = await createAdmin(data.email.toLowerCase(), data.password);
  res.status(201).json({ success: true, data: admin });
});
