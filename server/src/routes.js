import { Router } from 'express';
import { loadUser, requireAdmin, requirePermission } from './middleware/auth.js';
import { emailTestRateLimit } from './middleware/rateLimit.js';
import * as type from './modules/assetTypes/controller.js';
import * as field from './modules/fields/controller.js';
import * as dropdown from './modules/dropdowns/controller.js';
import * as asset from './modules/assets/controller.js';
import * as automation from './modules/assets/automationController.js';
import * as commonForm from './modules/commonForms/controller.js';
import * as commonAutomation from './modules/commonForms/automationController.js';
import * as user from './modules/users/controller.js';
import * as smtp from './modules/smtp/controller.js';
import * as turnstile from './modules/turnstile/controller.js';
import * as email from './modules/email/controller.js';
import * as quickEntry from './modules/quickEntry/controller.js';
import * as notification from './modules/notifications/controller.js';

const router = Router();
router.use(loadUser);

// Users (admin-only)
router.get('/users/capabilities', requireAdmin, user.capabilities);
router.get('/users', requireAdmin, user.list);
router.post('/users', requireAdmin, user.create);
router.patch('/users/:id', requireAdmin, user.update);
router.post('/users/:id/reset-password', requireAdmin, user.resetPassword);
router.put('/users/:id/permissions', requireAdmin, user.setPermissions);
router.delete('/users/:id', requireAdmin, user.remove);

// Common form (GET is needed by the dashboard empty-state check for every user)
router.get('/common-form', commonForm.get);
router.put('/common-form', requirePermission('common_form.manage_own'), commonForm.save);
router.get('/common-form/automations', requirePermission('common_form.manage_own', 'automations.manage_own'), commonAutomation.list);
router.post('/common-form/automations', requirePermission('automations.manage_own'), commonAutomation.create);
router.delete('/common-form/automations/:id', requirePermission('automations.manage_own'), commonAutomation.remove);

// Asset types
router.get('/asset-types', requirePermission('asset_types.view_own'), type.list);
router.post('/asset-types', requirePermission('asset_types.create_own'), type.create);
router.get('/asset-types/:id', requirePermission('asset_types.view_own'), type.get);
router.patch('/asset-types/:id', requirePermission('asset_types.edit_own'), type.update);
router.delete('/asset-types/:id', requirePermission('asset_types.delete_own'), type.remove);
router.get('/asset-types/:assetTypeId/automations', requirePermission('asset_types.view_own'), automation.list);
router.post('/asset-types/:assetTypeId/automations', requirePermission('automations.manage_own'), automation.create);
router.delete('/automations/:id', requirePermission('automations.manage_own'), automation.remove);
router.get('/asset-types/:id/form', requirePermission('asset_types.view_own'), type.form);
router.put('/asset-types/:id/form', requirePermission('asset_types.edit_own', 'fields.manage_own'), type.save);
// Sharing an asset type with other users is a super-admin capability.
router.get('/asset-types/:id/shares', requireAdmin, type.shares);
router.put('/asset-types/:id/shares', requireAdmin, type.setSharesController);

// Fields
router.get('/fields', requirePermission('fields.manage_own', 'asset_types.view_own', 'common_form.manage_own'), field.list);
router.post('/fields', requirePermission('fields.manage_own'), field.create);
router.get('/fields/:id', requirePermission('fields.manage_own', 'asset_types.view_own', 'common_form.manage_own'), field.get);
router.patch('/fields/:id', requirePermission('fields.manage_own'), field.update);
router.post('/fields/:id/type-preview', requirePermission('fields.manage_own'), field.preview);
router.delete('/fields/:id', requirePermission('fields.manage_own'), field.remove);

// Dropdowns (reads also allowed for users filling asset forms with dropdown fields)
router.get('/dropdowns', requirePermission('dropdowns.manage_own', 'fields.manage_own', 'asset_types.view_own'), dropdown.list);
router.post('/dropdowns', requirePermission('dropdowns.manage_own'), dropdown.create);
router.get('/dropdowns/:id', requirePermission('dropdowns.manage_own', 'fields.manage_own', 'assets.view_own'), dropdown.get);
router.patch('/dropdowns/:id', requirePermission('dropdowns.manage_own'), dropdown.update);
router.delete('/dropdowns/:id', requirePermission('dropdowns.manage_own'), dropdown.remove);
router.post('/dropdowns/:id/options', requirePermission('dropdowns.manage_own'), dropdown.createOption);
router.patch('/dropdowns/:id/options/:optionId', requirePermission('dropdowns.manage_own'), dropdown.updateOptionController);
router.delete('/dropdowns/:id/options/:optionId', requirePermission('dropdowns.manage_own'), dropdown.removeOption);

// Assets
router.get('/asset-types/:assetTypeId/assets/form', requirePermission('assets.view_own'), asset.form);
router.get('/asset-types/:assetTypeId/assets', requirePermission('assets.view_own'), asset.list);
router.post('/asset-types/:assetTypeId/assets', requirePermission('assets.create_own'), asset.create);
router.patch('/asset-types/:assetTypeId/assets/bulk', requirePermission('assets.bulk_own'), asset.bulkUpdate);
router.delete('/asset-types/:assetTypeId/assets/bulk', requirePermission('assets.bulk_own'), asset.bulkRemove);
router.get('/assets/:publicId', requirePermission('assets.view_own'), asset.get);
router.patch('/assets/:publicId', requirePermission('assets.edit_own'), asset.update);
router.delete('/assets/:publicId', requirePermission('assets.delete_own'), asset.remove);

// SMTP configuration (admin-only, global)
router.get('/settings/smtp', requireAdmin, smtp.get);
router.put('/settings/smtp', requireAdmin, smtp.update);
router.post('/settings/smtp/test-connection', requireAdmin, emailTestRateLimit, smtp.test);
router.post('/settings/smtp/test-email', requireAdmin, emailTestRateLimit, smtp.testEmail);
router.get('/settings/turnstile', requireAdmin, turnstile.get);
router.put('/settings/turnstile', requireAdmin, turnstile.update);

// Email templates / recipients / rules / history (per-user)
router.get('/email/templates', requirePermission('email.templates.manage_own', 'email.rules.manage_own'), email.listTemplates);
router.post('/email/templates', requirePermission('email.templates.manage_own'), email.createTemplate);
router.get('/email/templates/:id', requirePermission('email.templates.manage_own', 'email.rules.manage_own'), email.getTemplate);
router.patch('/email/templates/:id', requirePermission('email.templates.manage_own'), email.updateTemplate);
router.delete('/email/templates/:id', requirePermission('email.templates.manage_own'), email.removeTemplate);

router.get('/email/recipients', requirePermission('email.rules.manage_own'), email.listRecipients);
router.post('/email/recipients', requirePermission('email.rules.manage_own'), email.createRecipient);
router.patch('/email/recipients/:id', requirePermission('email.rules.manage_own'), email.updateRecipient);
router.delete('/email/recipients/:id', requirePermission('email.rules.manage_own'), email.removeRecipient);

router.get('/email/rules', requirePermission('email.rules.manage_own'), email.listRules);
router.post('/email/rules', requirePermission('email.rules.manage_own'), email.createRule);
router.get('/email/rules/:id', requirePermission('email.rules.manage_own'), email.getRule);
router.patch('/email/rules/:id', requirePermission('email.rules.manage_own'), email.updateRule);
router.delete('/email/rules/:id', requirePermission('email.rules.manage_own'), email.removeRule);
router.post('/email/rules/:id/test', requirePermission('email.rules.manage_own'), emailTestRateLimit, email.testRule);

router.get('/email/history/all', requireAdmin, email.historyAll);
router.get('/email/history', requirePermission('email.history.view_own'), email.history);

// Quick Entry — admin-only configuration (public submit + config live in app.js).
router.get('/quick-entry', requireAdmin, quickEntry.get);
router.put('/quick-entry', requireAdmin, quickEntry.save);

// In-app notifications — any authenticated user sees only their own rows.
router.get('/notifications', notification.list);
router.get('/notifications/unread-count', notification.counts);
router.post('/notifications/read-all', notification.readAll);
router.post('/notifications/:id/read', notification.read);

export default router;
