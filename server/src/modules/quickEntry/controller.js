import { asyncHandler } from '../../utils/errors.js';
import { getPublicConfig, getAdminConfig, saveAdminConfig, submitEntry } from './service.js';

// Public (no auth, no CSRF): used by the login screen to decide whether to show the form.
export const publicConfig = asyncHandler(async (_req, res) =>
  res.json({ success: true, data: await getPublicConfig() }));

// Public (no auth): unauthenticated submit. Rate-limited + Turnstile-checked in the service.
export const submit = asyncHandler(async (req, res) =>
  res.json({ success: true, data: await submitEntry(req) }));

// Admin: read the full configuration.
export const get = asyncHandler(async (_req, res) =>
  res.json({ success: true, data: await getAdminConfig() }));

// Admin: write the configuration (enable/disable, fields, recipients).
export const save = asyncHandler(async (req, res) =>
  res.json({ success: true, data: await saveAdminConfig(req.body) }));
