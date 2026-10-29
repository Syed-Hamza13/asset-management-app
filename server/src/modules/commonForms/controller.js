import { z } from 'zod';
import { asyncHandler } from '../../utils/errors.js';
import { getCommonForm, saveCommonForm } from './service.js';
import { copyCommonFormToUsers, listCopyTargets } from './copyService.js';

const formSchema = z.object({
  fields: z.array(z.object({
    fieldDefinitionId: z.coerce.number().int().positive(),
    required: z.boolean().default(false),
    showInList: z.boolean().default(true),
  })).max(100),
});

const copySchema = z.object({
  userIds: z.array(z.coerce.number().int().positive()).min(1).max(200),
});

export const get = asyncHandler(async (req, res) =>
  res.json({ success: true, data: await getCommonForm(req.user) }));

export const save = asyncHandler(async (req, res) =>
  res.json({ success: true, data: await saveCommonForm(req.user, formSchema.parse(req.body).fields) }));

export const copyTargets = asyncHandler(async (req, res) =>
  res.json({ success: true, data: await listCopyTargets(req.user) }));

export const copy = asyncHandler(async (req, res) =>
  res.json({ success: true, data: await copyCommonFormToUsers(req.user, copySchema.parse(req.body).userIds) }));
