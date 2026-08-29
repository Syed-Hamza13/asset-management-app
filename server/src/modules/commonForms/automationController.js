import * as service from './automationService.js';

export async function list(_req, res) { res.json({ success: true, data: await service.listCommonAutomations() }); }
export async function create(req, res) { res.status(201).json({ success: true, data: await service.createCommonAutomation(req.body) }); }
export async function remove(req, res) { await service.deleteCommonAutomation(req.params.id); res.json({ success: true }); }
