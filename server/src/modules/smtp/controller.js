import { z } from 'zod';
import { asyncHandler } from '../../utils/errors.js';
import { EMAIL_RE } from '../../utils/validation.js';
import { getSmtpConfig, updateSmtpConfig, testConnection, sendTestEmail } from './service.js';

const updateSchema = z.object({
  host: z.string().trim().max(255).optional(),
  port: z.coerce.number().int().min(1).max(65535).optional(),
  secure: z.boolean().optional(),
  username: z.string().trim().max(255).optional(),
  password: z.string().max(500).nullable().optional(),
  fromEmail: z.string().trim().max(255).refine((v) => v === '' || EMAIL_RE.test(v), { message: 'Invalid from email' }).optional(),
  fromName: z.string().trim().max(255).optional(),
  replyTo: z.string().trim().max(255).optional(),
  enabled: z.boolean().optional(),
});
const testEmailSchema = z.object({ to: z.string().trim().email().max(255) });

export const get = asyncHandler(async (_req, res) => res.json({ success: true, data: await getSmtpConfig() }));
export const update = asyncHandler(async (req, res) => res.json({ success: true, data: await updateSmtpConfig(updateSchema.parse(req.body)) }));
export const test = asyncHandler(async (_req, res) => res.json({ success: true, data: await testConnection() }));
export const testEmail = asyncHandler(async (req, res) => res.json({ success: true, data: await sendTestEmail(testEmailSchema.parse(req.body).to) }));
