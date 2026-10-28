import { z } from 'zod';
import { asyncHandler } from '../../utils/errors.js';
import { getTurnstileSettings, setTurnstileEnabled, turnstilePublicConfig } from '../setup/turnstile.js';

export const config = asyncHandler(async (_req, res) => res.json({ success: true, data: await turnstilePublicConfig() }));
export const get = asyncHandler(async (_req, res) => res.json({ success: true, data: await getTurnstileSettings() }));
export const update = asyncHandler(async (req, res) => {
  const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body);
  res.json({ success: true, data: await setTurnstileEnabled(enabled) });
});
