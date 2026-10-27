import { z } from 'zod';
import { asyncHandler } from '../../utils/errors.js';
import { createField, deleteField, getField, listFields, updateField } from './service.js';
const schema = z.object({ name: z.string().trim().min(1).max(150), key: z.string().trim().max(100).optional(), type: z.string(), dropdownId: z.coerce.number().int().positive().nullable().optional(), isActive: z.boolean().optional().default(true) });
export const list = asyncHandler(async (req, res) => res.json({ success: true, data: await listFields(req.user) }));
export const get = asyncHandler(async (req, res) => res.json({ success: true, data: await getField(req.user, req.params.id) }));
export const create = asyncHandler(async (req, res) => res.status(201).json({ success: true, data: await createField(req.user, schema.parse(req.body)) }));
export const update = asyncHandler(async (req, res) => res.json({ success: true, data: await updateField(req.user, req.params.id, schema.parse(req.body)) }));
export const remove = asyncHandler(async (req, res) => { await deleteField(req.user, req.params.id); res.json({ success: true }); });
