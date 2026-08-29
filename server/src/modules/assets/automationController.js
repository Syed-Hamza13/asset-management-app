import * as service from './automation.js';

export async function list(req, res) { res.json({ success: true, data: await service.listAutomations(req.params.assetTypeId) }); }
export async function create(req, res) { res.status(201).json({ success: true, data: await service.createAutomation(req.params.assetTypeId, req.body) }); }
export async function remove(req, res) { await service.deleteAutomation(req.params.id); res.json({ success: true }); }
