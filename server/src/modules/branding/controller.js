import { z } from 'zod';
import { asyncHandler } from '../../utils/errors.js';
import { getBranding, updateBranding } from './service.js';

const bodySchema = z.object({ key: z.enum(['favicon_data_url', 'app_icon_data_url']), value: z.string().min(1).max(4_000_000) });

export const get = asyncHandler(async (_req, res) => res.json({ success: true, data: await getBranding() }));
export const update = asyncHandler(async (req, res) => {
  const data = bodySchema.parse(req.body);
  res.json({ success: true, data: await updateBranding(data.key, data.value) });
});
