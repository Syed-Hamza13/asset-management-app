import { asyncHandler } from '../../utils/errors.js';
import { gateQuickEntryConfig } from '../ipAccess/service.js';
import { getPublicConfig, getAdminConfig, saveAdminConfig, submitEntry } from './service.js';

// Public (no auth, no CSRF): used by the login screen to decide whether to show the form.
// When the caller's IP is gated for quick entry the form reports itself disabled,
// which hides the card without any client-side knowledge of the allowlist.
export const publicConfig = asyncHandler(async (req, res) =>
  res.json({ success: true, data: await gateQuickEntryConfig(await getPublicConfig(), req) }));

// Public (no auth): unauthenticated submit. Rate-limited + Turnstile-checked in the service.
export const submit = asyncHandler(async (req, res) =>
  res.json({ success: true, data: await submitEntry(req) }));

// Admin: read the full configuration.
export const get = asyncHandler(async (_req, res) =>
  res.json({ success: true, data: await getAdminConfig() }));

// Admin: write the configuration (enable/disable, fields, recipients).
export const save = asyncHandler(async (req, res) =>
  res.json({ success: true, data: await saveAdminConfig(req.body) }));
