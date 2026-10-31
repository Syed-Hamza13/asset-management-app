import { asyncHandler } from '../../utils/errors.js';
import * as service from './automation.js';

export const list = asyncHandler(async (req, res) => res.json({ success: true, data: await service.listAutomations(req.user, req.params.assetTypeId) }));
export const create = asyncHandler(async (req, res) => res.status(201).json({ success: true, data: await service.createAutomation(req.user, req.params.assetTypeId, req.body) }));
export const remove = asyncHandler(async (req, res) => { await service.deleteAutomation(req.user, req.params.id); res.json({ success: true }); });
