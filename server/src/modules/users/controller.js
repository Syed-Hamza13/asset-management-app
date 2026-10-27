import { z } from 'zod';
import { asyncHandler } from '../../utils/errors.js';
import { ALL_CAPABILITIES, DEFAULT_PERMISSIONS } from './capabilities.js';
import { createUser, deleteUser, listUsers, resetUserPassword, setUserPermissions, updateUser } from './service.js';

const createSchema = z.object({
  email: z.string().trim().max(255),
  password: z.string().min(10).max(200),
  role: z.enum(['admin', 'user']).default('user'),
  permissions: z.array(z.string()).optional(),
});
const updateSchema = z.object({
  isActive: z.boolean().optional(),
  role: z.enum(['admin', 'user']).optional(),
});
const passwordSchema = z.object({ password: z.string().min(10).max(200) });
const permissionsSchema = z.object({ permissions: z.array(z.string()).optional() });

export const list = asyncHandler(async (_req, res) => res.json({ success: true, data: await listUsers() }));
export const capabilities = asyncHandler(async (_req, res) => res.json({ success: true, data: { all: ALL_CAPABILITIES, defaults: DEFAULT_PERMISSIONS } }));
export const create = asyncHandler(async (req, res) => res.status(201).json({ success: true, data: await createUser(createSchema.parse(req.body)) }));
export const update = asyncHandler(async (req, res) => res.json({ success: true, data: await updateUser(req.user, req.params.id, updateSchema.parse(req.body)) }));
export const resetPassword = asyncHandler(async (req, res) => res.json({ success: true, data: await resetUserPassword(req.user, req.params.id, passwordSchema.parse(req.body).password) }));
export const setPermissions = asyncHandler(async (req, res) => res.json({ success: true, data: await setUserPermissions(req.user, req.params.id, permissionsSchema.parse(req.body).permissions) }));
export const remove = asyncHandler(async (req, res) => { await deleteUser(req.user, req.params.id); res.json({ success: true }); });
