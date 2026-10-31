import { z } from 'zod';
import { asyncHandler } from '../../utils/errors.js';
import * as svc from './service.js';

const templateCreate = z.object({
  name: z.string().trim().min(1).max(150),
  subjectTemplate: z.string().trim().min(1).max(500),
  bodyTemplate: z.string().max(20000).default(''),
  isActive: z.boolean().optional(),
});
const templateUpdate = templateCreate.partial();

const recipientCreate = z.object({
  name: z.string().trim().max(150).default(''),
  email: z.string().trim().email().max(255),
  isActive: z.boolean().optional(),
});
const recipientUpdate = recipientCreate.partial();

const ruleCreate = z.object({
  assetTypeIds: z.array(z.coerce.number().int().positive()).min(1).optional(),
  assetTypeId: z.coerce.number().int().positive().optional(),
  triggerType: z.enum(['asset_created', 'field_changed']),
  triggerFieldId: z.coerce.number().int().positive().nullish(),
  triggerCondition: z.enum(['any_change', 'equals', 'not_equals', 'filled', 'empty']).optional(),
  triggerConditionValue: z.string().max(255).nullish(),
  templateId: z.coerce.number().int().positive(),
  recipientIds: z.array(z.coerce.number().int().positive()).min(1),
  isActive: z.boolean().optional(),
}).refine((v) => (v.assetTypeIds && v.assetTypeIds.length) || v.assetTypeId, { message: 'At least one asset type is required.' });
const ruleUpdate = z.object({
  assetTypeIds: z.array(z.coerce.number().int().positive()).min(1).optional(),
  assetTypeId: z.coerce.number().int().positive().optional(),
  triggerType: z.enum(['asset_created', 'field_changed']).optional(),
  triggerFieldId: z.coerce.number().int().positive().nullish(),
  triggerCondition: z.enum(['any_change', 'equals', 'not_equals', 'filled', 'empty']).optional(),
  triggerConditionValue: z.string().max(255).nullish(),
  templateId: z.coerce.number().int().positive().optional(),
  recipientIds: z.array(z.coerce.number().int().positive()).min(1).optional(),
  isActive: z.boolean().optional(),
});

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });

// Templates
export const listTemplates = asyncHandler(async (req, res) => ok(res, await svc.listTemplates(req.user)));
export const createTemplate = asyncHandler(async (req, res) => ok(res, await svc.createTemplate(req.user, templateCreate.parse(req.body)), 201));
export const getTemplate = asyncHandler(async (req, res) => ok(res, await svc.getTemplate(req.user, req.params.id)));
export const updateTemplate = asyncHandler(async (req, res) => ok(res, await svc.updateTemplate(req.user, req.params.id, templateUpdate.parse(req.body))));
export const removeTemplate = asyncHandler(async (req, res) => { await svc.deleteTemplate(req.user, req.params.id); res.json({ success: true }); });

// Recipients
export const listRecipients = asyncHandler(async (req, res) => ok(res, await svc.listRecipients(req.user)));
export const createRecipient = asyncHandler(async (req, res) => ok(res, await svc.createRecipient(req.user, recipientCreate.parse(req.body)), 201));
export const updateRecipient = asyncHandler(async (req, res) => ok(res, await svc.updateRecipient(req.user, req.params.id, recipientUpdate.parse(req.body))));
export const removeRecipient = asyncHandler(async (req, res) => { await svc.deleteRecipient(req.user, req.params.id); res.json({ success: true }); });

// Rules
export const listRules = asyncHandler(async (req, res) => ok(res, await svc.listRules(req.user, req.query.assetTypeId)));
export const createRule = asyncHandler(async (req, res) => ok(res, await svc.createRule(req.user, ruleCreate.parse(req.body)), 201));
export const getRule = asyncHandler(async (req, res) => ok(res, await svc.getRule(req.user, req.params.id)));
export const updateRule = asyncHandler(async (req, res) => ok(res, await svc.updateRule(req.user, req.params.id, ruleUpdate.parse(req.body))));
export const removeRule = asyncHandler(async (req, res) => { await svc.deleteRule(req.user, req.params.id); res.json({ success: true }); });
export const testRule = asyncHandler(async (req, res) => ok(res, await svc.sendRuleTest(req.user, req.params.id)));

// History
export const history = asyncHandler(async (req, res) => ok(res, await svc.getHistory(req.user, { status: req.query.status, all: false, limit: req.query.limit })));
export const historyAll = asyncHandler(async (req, res) => ok(res, await svc.getHistory(req.user, { status: req.query.status, all: true, limit: req.query.limit })));
