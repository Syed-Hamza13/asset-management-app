import { z } from 'zod';
import { asyncHandler } from '../../utils/errors.js';
import { getAdminView, saveSettings } from './service.js';

const saveSchema = z.object({
  loginEnabled: z.boolean(),
  quickEntryEnabled: z.boolean(),
  list: z.string().max(8000, 'The allowlist text is too long.'),
});

export const get = asyncHandler(async (req, res) =>
  res.json({ success: true, data: await getAdminView(req) }));

export const update = asyncHandler(async (req, res) =>
  res.json({ success: true, data: await saveSettings(req, saveSchema.parse(req.body)) }));
