import { pool, withTransaction } from '../../config/db.js';
import { AppError } from '../../utils/errors.js';
import { assertIntegerId } from '../../utils/validation.js';
import { ownerScope } from '../../utils/scope.js';
import { validatePlaceholders, renderTemplate } from './placeholder.js';
import { getSendTransport, fromHeader } from '../smtp/service.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function mapTemplate(r) {
  return { id: r.id, name: r.name, subjectTemplate: r.subject_template, bodyTemplate: r.body_template, isActive: Boolean(r.is_active), createdAt: r.created_at, updatedAt: r.updated_at };
}
function mapRecipient(r) {
  return { id: r.id, name: r.name, email: r.email, isActive: Boolean(r.is_active), createdAt: r.created_at, updatedAt: r.updated_at };
}

// ---------- Templates ----------
export async function listTemplates(actor) {
  const scope = ownerScope(actor);
  const [rows] = await pool.execute(`SELECT * FROM email_templates WHERE 1=1${scope.sql} ORDER BY name ASC`, scope.params);
  return rows.map(mapTemplate);
}
async function getTemplateRow(actor, id) {
  const idN = assertIntegerId(id, 'template id');
  const scope = ownerScope(actor);
  const [rows] = await pool.execute(`SELECT * FROM email_templates WHERE id = ?${scope.sql} LIMIT 1`, [idN, ...scope.params]);
  if (!rows.length) throw new AppError(404, 'TEMPLATE_NOT_FOUND', 'Template not found.');
  return rows[0];
}
export async function getTemplate(actor, id) { return mapTemplate(await getTemplateRow(actor, id)); }
export async function createTemplate(actor, { name, subjectTemplate, bodyTemplate, isActive = true }) {
  if (!name || !name.trim()) throw new AppError(400, 'INVALID_NAME', 'Template name is required.');
  if (!subjectTemplate || !subjectTemplate.trim()) throw new AppError(400, 'INVALID_SUBJECT', 'Subject is required.');
  validatePlaceholders(subjectTemplate, bodyTemplate);
  const [r] = await pool.execute(
    'INSERT INTO email_templates (owner_user_id, name, subject_template, body_template, is_active) VALUES (?,?,?,?,?)',
    [actor.id, name.trim(), subjectTemplate, bodyTemplate ?? '', Boolean(isActive)],
  );
  return getTemplate(actor, r.insertId);
}
export async function updateTemplate(actor, id, patch) {
  const row = await getTemplateRow(actor, id);
  const name = patch.name ?? row.name;
  const subjectTemplate = patch.subjectTemplate ?? row.subject_template;
  const bodyTemplate = patch.bodyTemplate ?? row.body_template;
  const isActive = patch.isActive === undefined ? Boolean(row.is_active) : Boolean(patch.isActive);
  validatePlaceholders(subjectTemplate, bodyTemplate);
  await pool.execute('UPDATE email_templates SET name=?, subject_template=?, body_template=?, is_active=? WHERE id=?', [name, subjectTemplate, bodyTemplate, isActive, row.id]);
  return getTemplate(actor, id);
}
export async function deleteTemplate(actor, id) {
  const row = await getTemplateRow(actor, id);
  const [[{ count }]] = await pool.execute('SELECT COUNT(*) AS count FROM email_rules WHERE template_id = ?', [row.id]);
  if (Number(count) > 0) throw new AppError(400, 'TEMPLATE_IN_USE', 'This template is used by one or more rules. Delete or reassign those rules first.');
  await pool.execute('DELETE FROM email_templates WHERE id = ?', [row.id]);
}

// ---------- Recipients ----------
export async function listRecipients(actor) {
  const scope = ownerScope(actor);
  const [rows] = await pool.execute(`SELECT * FROM email_recipients WHERE 1=1${scope.sql} ORDER BY name ASC, email ASC`, scope.params);
  return rows.map(mapRecipient);
}
async function getRecipientRow(actor, id) {
  const idN = assertIntegerId(id, 'recipient id');
  const scope = ownerScope(actor);
  const [rows] = await pool.execute(`SELECT * FROM email_recipients WHERE id = ?${scope.sql} LIMIT 1`, [idN, ...scope.params]);
  if (!rows.length) throw new AppError(404, 'RECIPIENT_NOT_FOUND', 'Recipient not found.');
  return rows[0];
}
export async function createRecipient(actor, { name = '', email, isActive = true }) {
  if (!EMAIL_RE.test(String(email || ''))) throw new AppError(400, 'INVALID_EMAIL', 'A valid recipient email is required.');
  const [r] = await pool.execute('INSERT INTO email_recipients (owner_user_id, name, email, is_active) VALUES (?,?,?,?)', [actor.id, String(name || '').trim(), String(email).trim().toLowerCase(), Boolean(isActive)]);
  return mapRecipient(await getRecipientRow(actor, r.insertId));
}
export async function updateRecipient(actor, id, patch) {
  const row = await getRecipientRow(actor, id);
  const name = patch.name ?? row.name;
  const email = patch.email ?? row.email;
  const isActive = patch.isActive === undefined ? Boolean(row.is_active) : Boolean(patch.isActive);
  if (!EMAIL_RE.test(String(email || ''))) throw new AppError(400, 'INVALID_EMAIL', 'A valid recipient email is required.');
  await pool.execute('UPDATE email_recipients SET name=?, email=?, is_active=? WHERE id=?', [String(name || '').trim(), String(email).trim().toLowerCase(), isActive, row.id]);
  return mapRecipient(await getRecipientRow(actor, id));
}
export async function deleteRecipient(actor, id) {
  const row = await getRecipientRow(actor, id);
  await pool.execute('DELETE FROM email_recipients WHERE id = ?', [row.id]);
}

// ---------- Rules ----------
function mapRule(r, recipients = [], assetTypes = []) {
  const types = assetTypes.length ? assetTypes : [{ id: Number(r.asset_type_id), name: r.asset_type_name }];
  return {
    id: r.id, assetTypeId: r.asset_type_id, assetTypeName: r.asset_type_name,
    assetTypeIds: types.map((t) => Number(t.id)), assetTypes: types,
    triggerType: r.trigger_type, triggerFieldId: r.trigger_field_id, triggerFieldKey: r.trigger_field_key,
    triggerCondition: r.trigger_condition, triggerConditionValue: r.trigger_condition_value,
    templateId: r.template_id, templateName: r.template_name, isActive: Boolean(r.is_active),
    recipients, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}
async function loadRulesWithRecipients(actor, whereSql, params) {
  const scope = ownerScope(actor, 'er.owner_user_id');
  const [rows] = await pool.execute(
    `SELECT er.*, at.name AS asset_type_name, et.name AS template_name, fd.\`key\` AS trigger_field_key
     FROM email_rules er
     JOIN asset_types at ON at.id = er.asset_type_id
     JOIN email_templates et ON et.id = er.template_id
     LEFT JOIN field_definitions fd ON fd.id = er.trigger_field_id
     WHERE 1=1${scope.sql}${whereSql} ORDER BY er.created_at DESC`,
    [...scope.params, ...params],
  );
  if (!rows.length) return [];
  const ruleIds = rows.map((r) => r.id);
  const inClause = ruleIds.map(() => '?').join(',');
  const [recips] = await pool.query(
    `SELECT err.rule_id, r.id, r.name, r.email, r.is_active FROM email_rule_recipients err JOIN email_recipients r ON r.id = err.recipient_id WHERE err.rule_id IN (${inClause})`,
    ruleIds,
  );
  const [typeRows] = await pool.query(
    `SELECT erat.rule_id, erat.asset_type_id AS id, at.name FROM email_rule_asset_types erat JOIN asset_types at ON at.id = erat.asset_type_id WHERE erat.rule_id IN (${inClause}) ORDER BY erat.asset_type_id ASC`,
    ruleIds,
  );
  const byRule = new Map();
  for (const rec of recips) {
    if (!byRule.has(rec.rule_id)) byRule.set(rec.rule_id, []);
    byRule.get(rec.rule_id).push({ id: rec.id, name: rec.name, email: rec.email, isActive: Boolean(rec.is_active) });
  }
  const typesByRule = new Map();
  for (const tr of typeRows) {
    if (!typesByRule.has(tr.rule_id)) typesByRule.set(tr.rule_id, []);
    typesByRule.get(tr.rule_id).push({ id: Number(tr.id), name: tr.name });
  }
  return rows.map((r) => mapRule(r, byRule.get(r.id) || [], typesByRule.get(r.id) || []));
}
export async function listRules(actor, assetTypeId) {
  if (assetTypeId === undefined) return loadRulesWithRecipients(actor, '', []);
  const id = assertIntegerId(assetTypeId, 'asset type id');
  return loadRulesWithRecipients(
    actor,
    ' AND EXISTS (SELECT 1 FROM email_rule_asset_types e WHERE e.rule_id = er.id AND e.asset_type_id = ?)',
    [id],
  );
}
export async function getRule(actor, id) {
  const idN = assertIntegerId(id, 'rule id');
  const rules = await loadRulesWithRecipients(actor, ' AND er.id = ?', [idN]);
  if (!rules.length) throw new AppError(404, 'RULE_NOT_FOUND', 'Rule not found.');
  return rules[0];
}

async function validateRuleInputs(actor, conn, { assetTypeIds, triggerType, triggerFieldId, templateId, recipientIds }) {
  const typeScope = ownerScope(actor, 'owner_user_id');
  const uniqueTypeIds = [...new Set((assetTypeIds || []).map((x) => assertIntegerId(x, 'asset type id')))];
  if (!uniqueTypeIds.length) throw new AppError(400, 'ASSET_TYPES_REQUIRED', 'Select at least one asset type.');
  const typeIn = uniqueTypeIds.map(() => '?').join(',');
  const [typeRows] = await conn.query(
    `SELECT id FROM asset_types WHERE id IN (${typeIn})${typeScope.sql}`,
    [...uniqueTypeIds, ...typeScope.params],
  );
  if (typeRows.length !== uniqueTypeIds.length) throw new AppError(404, 'ASSET_TYPE_NOT_FOUND', 'One or more asset types were not found.');

  const [[tpl]] = await conn.execute(`SELECT id FROM email_templates WHERE id = ?${typeScope.sql} LIMIT 1`, [templateId, ...typeScope.params]);
  if (!tpl) throw new AppError(404, 'TEMPLATE_NOT_FOUND', 'Template not found.');

  if (triggerType === 'field_changed') {
    if (!triggerFieldId) throw new AppError(400, 'TRIGGER_FIELD_REQUIRED', 'A trigger field is required for field_changed rules.');
    const fieldScope = ownerScope(actor, 'f.owner_user_id');
    const [[fieldRow]] = await conn.execute(
      `SELECT f.id FROM field_definitions f JOIN asset_type_fields atf ON atf.field_definition_id = f.id
       WHERE f.id = ? AND atf.asset_type_id IN (${typeIn})${fieldScope.sql} LIMIT 1`,
      [triggerFieldId, ...uniqueTypeIds, ...fieldScope.params],
    );
    if (!fieldRow) throw new AppError(400, 'TRIGGER_FIELD_INVALID', 'Trigger field must belong to one of the selected asset types.');
  }

  if (!Array.isArray(recipientIds) || recipientIds.length === 0) throw new AppError(400, 'RECIPIENTS_REQUIRED', 'Select at least one recipient.');
  const uniqueIds = [...new Set(recipientIds.map((x) => assertIntegerId(x, 'recipient id')))];
  const [recRows] = await conn.query(
    `SELECT id FROM email_recipients WHERE id IN (${uniqueIds.map(() => '?').join(',')})${typeScope.sql}`,
    [...uniqueIds, ...typeScope.params],
  );
  if (recRows.length !== uniqueIds.length) throw new AppError(400, 'RECIPIENT_INVALID', 'One or more recipients do not belong to you.');
  return { uniqueTypeIds, recipientIds: uniqueIds };
}

export async function createRule(actor, input) {
  const assetTypeIds = Array.isArray(input.assetTypeIds)
    ? input.assetTypeIds.map((x) => assertIntegerId(x, 'asset type id'))
    : [assertIntegerId(input.assetTypeId, 'asset type id')];
  const templateId = assertIntegerId(input.templateId, 'template id');
  const triggerType = input.triggerType;
  if (!['asset_created', 'field_changed'].includes(triggerType)) throw new AppError(400, 'INVALID_TRIGGER', 'triggerType must be asset_created or field_changed.');
  const triggerFieldId = input.triggerFieldId ? assertIntegerId(input.triggerFieldId, 'trigger field id') : null;
  const condition = triggerType === 'field_changed' ? (input.triggerCondition || 'any_change') : null;
  if (condition && !['any_change', 'equals', 'not_equals', 'filled', 'empty'].includes(condition)) throw new AppError(400, 'INVALID_CONDITION', 'Invalid trigger condition.');
  const conditionValue = condition === 'equals' || condition === 'not_equals' ? String(input.triggerConditionValue ?? '') : null;
  const isActive = input.isActive === undefined ? true : Boolean(input.isActive);

  let newId;
  await withTransaction(async (conn) => {
    const { uniqueTypeIds, recipientIds } = await validateRuleInputs(actor, conn, { assetTypeIds, triggerType, triggerFieldId, templateId, recipientIds: input.recipientIds });
    const [r] = await conn.execute(
      `INSERT INTO email_rules (owner_user_id, asset_type_id, trigger_type, trigger_field_id, trigger_condition, trigger_condition_value, template_id, is_active) VALUES (?,?,?,?,?,?,?,?)`,
      [actor.id, uniqueTypeIds[0], triggerType, triggerType === 'field_changed' ? triggerFieldId : null, condition, conditionValue, templateId, isActive],
    );
    newId = r.insertId;
    for (const tid of uniqueTypeIds) await conn.execute('INSERT INTO email_rule_asset_types (rule_id, asset_type_id) VALUES (?,?)', [newId, tid]);
    for (const rid of recipientIds) await conn.execute('INSERT INTO email_rule_recipients (rule_id, recipient_id) VALUES (?,?)', [newId, rid]);
  });
  return getRule(actor, newId);
}

export async function updateRule(actor, id, input) {
  const existing = await getRule(actor, id);
  const assetTypeIds = Array.isArray(input.assetTypeIds)
    ? input.assetTypeIds.map((x) => assertIntegerId(x, 'asset type id'))
    : existing.assetTypeIds;
  const templateId = input.templateId ? assertIntegerId(input.templateId, 'template id') : existing.templateId;
  const triggerType = input.triggerType ?? existing.triggerType;
  if (!['asset_created', 'field_changed'].includes(triggerType)) throw new AppError(400, 'INVALID_TRIGGER', 'triggerType must be asset_created or field_changed.');
  const triggerFieldId = input.triggerFieldId !== undefined ? (input.triggerFieldId ? assertIntegerId(input.triggerFieldId, 'trigger field id') : null) : existing.triggerFieldId;
  const condition = triggerType === 'field_changed' ? (input.triggerCondition ?? existing.triggerCondition ?? 'any_change') : null;
  const conditionValue = condition === 'equals' || condition === 'not_equals' ? String(input.triggerConditionValue ?? existing.triggerConditionValue ?? '') : null;
  const isActive = input.isActive === undefined ? existing.isActive : Boolean(input.isActive);
  const recipientIds = input.recipientIds ?? existing.recipients.map((r) => r.id);

  await withTransaction(async (conn) => {
    const { uniqueTypeIds, recipientIds: validatedRecipients } = await validateRuleInputs(actor, conn, { assetTypeIds, triggerType, triggerFieldId, templateId, recipientIds });
    await conn.execute(
      `UPDATE email_rules SET asset_type_id=?, trigger_type=?, trigger_field_id=?, trigger_condition=?, trigger_condition_value=?, template_id=?, is_active=? WHERE id=?`,
      [uniqueTypeIds[0], triggerType, triggerType === 'field_changed' ? triggerFieldId : null, condition, conditionValue, templateId, isActive, existing.id],
    );
    await conn.execute('DELETE FROM email_rule_asset_types WHERE rule_id = ?', [existing.id]);
    for (const tid of uniqueTypeIds) await conn.execute('INSERT INTO email_rule_asset_types (rule_id, asset_type_id) VALUES (?,?)', [existing.id, tid]);
    await conn.execute('DELETE FROM email_rule_recipients WHERE rule_id = ?', [existing.id]);
    for (const rid of validatedRecipients) await conn.execute('INSERT INTO email_rule_recipients (rule_id, recipient_id) VALUES (?,?)', [existing.id, rid]);
  });
  return getRule(actor, id);
}

export async function deleteRule(actor, id) {
  const existing = await getRule(actor, id);
  await pool.execute('DELETE FROM email_rules WHERE id = ?', [existing.id]);
}

// ---------- History (outbox) ----------
function mapOutbox(r) {
  const parse = (v) => (typeof v === 'string' ? JSON.parse(v) : v);
  return {
    id: r.id, ruleId: r.rule_id, assetPublicId: r.asset_public_id, eventType: r.event_type,
    status: r.status, attempts: r.attempts, lastError: r.last_error,
    recipients: parse(r.recipients_json), template: parse(r.template_snapshot_json),
    ownerEmail: r.owner_email, createdAt: r.created_at, sentAt: r.sent_at,
  };
}
export async function getHistory(actor, { status, all = false, limit = 100 } = {}) {
  const isAdminAll = all && actor.isAdmin;
  const scope = isAdminAll ? { sql: '', params: [] } : ownerScope(actor, 'eo.owner_user_id');
  const statusFilter = status && ['pending', 'sending', 'sent', 'failed', 'cancelled'].includes(status) ? ' AND eo.status = ?' : '';
  const statusParams = statusFilter ? [status] : [];
  const max = Math.min(Math.max(Number(limit) || 100, 1), 200);
  const [rows] = await pool.execute(
    `SELECT eo.*, u.email AS owner_email FROM email_outbox eo JOIN users u ON u.id = eo.owner_user_id
     WHERE 1=1${scope.sql}${statusFilter} ORDER BY eo.created_at DESC LIMIT ${max}`,
    [...scope.params, ...statusParams],
  );
  return rows.map(mapOutbox);
}

// Send a test render of a rule's template to its recipients (synchronous).
export async function sendRuleTest(actor, id) {
  const rule = await getRule(actor, id);
  const scope = ownerScope(actor);
  const [tplRows] = await pool.execute(`SELECT subject_template, body_template FROM email_templates WHERE id = ?${scope.sql} LIMIT 1`, [rule.templateId, ...scope.params]);
  if (!tplRows.length) throw new AppError(404, 'TEMPLATE_NOT_FOUND', 'Template not found.');
  const typeIds = (rule.assetTypeIds && rule.assetTypeIds.length ? rule.assetTypeIds : [rule.assetTypeId]).map(() => '?').join(',');
  const [fieldRows] = await pool.query(
    `SELECT DISTINCT f.\`key\` FROM asset_type_fields atf JOIN field_definitions f ON f.id = atf.field_definition_id WHERE atf.asset_type_id IN (${typeIds})`,
    (rule.assetTypeIds && rule.assetTypeIds.length ? rule.assetTypeIds : [rule.assetTypeId]),
  );
  const sampleFields = Object.fromEntries(fieldRows.map((f) => [f.key, `sample ${f.key}`]));
  const payload = {
    assetTypeName: rule.assetTypeName, publicId: 'SAMPLE-PUBLIC-ID',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    user: { email: actor.email, name: actor.email },
    fields: sampleFields, previous: sampleFields,
  };
  const recipients = rule.recipients.map((r) => r.email).filter(Boolean);
  if (!recipients.length) throw new AppError(400, 'RECIPIENTS_REQUIRED', 'This rule has no active recipients.');
  const { transport, cfg } = await getSendTransport();
  try {
    const info = await transport.sendMail({
      from: fromHeader(cfg),
      to: recipients.join(', '),
      replyTo: cfg.replyTo || undefined,
      subject: `[TEST] ${renderTemplate(tplRows[0].subject_template, payload)}`,
      text: renderTemplate(tplRows[0].body_template, payload),
    });
    return { ok: true, messageId: info.messageId, recipients };
  } catch (e) {
    throw new AppError(400, 'SMTP_TEST_FAILED', `Send failed: ${e.message}`);
  }
}
