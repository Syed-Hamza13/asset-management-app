import { asyncHandler } from '../../utils/errors.js';
import * as service from './automationService.js';

export const list = asyncHandler(async (req, res) => res.json({ success: true, data: await service.listCommonAutomations(req.user) }));
export const create = asyncHandler(async (req, res) => res.status(201).json({ success: true, data: await service.createCommonAutomation(req.user, req.body) }));
export const remove = asyncHandler(async (req, res) => { await service.deleteCommonAutomation(req.user, req.params.id); res.json({ success: true }); });
