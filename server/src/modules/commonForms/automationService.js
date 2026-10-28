import { pool } from '../../config/db.js';
import { AppError } from '../../utils/errors.js';
import { assertIntegerId, validateFieldValue } from '../../utils/validation.js';
import { applyAutomationRules } from '../../../../shared/automationRules.js';
import { ensureCommonForm } from './service.js';

const CONDITIONS = new Set(['filled', 'empty', 'changed', 'equals']);
const ACTIONS = new Set(['set_value', 'set_today', 'clear']);

async function getFields(actor, formId) {
  const [rows] = await pool.execute(`SELECT f.id, f.name, f.\`key\` AS field_key, f.type, f.dropdown_id
    FROM common_form_fields cff JOIN field_definitions f ON f.id = cff.field_definition_id
    WHERE cff.common_form_id = ? AND f.is_active = 1`, [formId]);
  return rows;
}

export async function listCommonAutomations(actor) {
  const formId = await ensureCommonForm(actor);
  const [rows] = await pool.execute(`SELECT a.id, a.source_field_id, sf.name AS source_field_name,
    sf.type AS source_field_type, sf.dropdown_id AS source_dropdown_id, a.condition_type, a.condition_value, a.target_field_id,
    tf.name AS target_field_name, tf.type AS target_field_type, tf.dropdown_id AS target_dropdown_id, a.action_type, a.action_value
    FROM common_form_automations a JOIN field_definitions sf ON sf.id = a.source_field_id
    JOIN field_definitions tf ON tf.id = a.target_field_id
    WHERE a.common_form_id = ? ORDER BY a.id ASC`, [formId]);
  return rows;
}

async function validateAutomationValue(field, value) {
  let options = new Set();
  if (field.type === 'dropdown') {
    const [rows] = await pool.execute('SELECT value FROM dropdown_options WHERE dropdown_id = ? AND is_active = 1', [field.dropdown_id]);
    options = new Set(rows.map((row) => row.value));
  }
  let parsed = value;
  if (field.type === 'number') parsed = Number(value);
  if (field.type === 'boolean') parsed = value === 'true';
  validateFieldValue(field, parsed, options);
}

export async function createCommonAutomation(actor, input) {
  const formId = await ensureCommonForm(actor);
  const sourceId = assertIntegerId(input.sourceFieldId, 'source field id');
  const targetId = assertIntegerId(input.targetFieldId, 'target field id');
  if (!CONDITIONS.has(input.conditionType)) throw new AppError(400, 'INVALID_AUTOMATION_CONDITION', 'Invalid automation condition.');
  if (!ACTIONS.has(input.actionType)) throw new AppError(400, 'INVALID_AUTOMATION_ACTION', 'Invalid automation action.');
  const fields = await getFields(actor, formId);
  const source = fields.find((field) => Number(field.id) === sourceId);
  const target = fields.find((field) => Number(field.id) === targetId);
  if (!source || !target) throw new AppError(400, 'AUTOMATION_FIELD_NOT_IN_FORM', 'Source and target fields must belong to the common form.');
  if (source.id === target.id && input.actionType === 'set_value') throw new AppError(400, 'INVALID_AUTOMATION', 'A field cannot set itself from its own rule.');
  if (input.conditionType === 'equals' && input.conditionValue === undefined) throw new AppError(400, 'CONDITION_VALUE_REQUIRED', 'Condition value is required.');
  if (input.actionType === 'set_value' && (input.actionValue === undefined || input.actionValue === null)) throw new AppError(400, 'ACTION_VALUE_REQUIRED', 'Action value is required.');
  if (input.actionType === 'set_today' && !['date', 'auto_date'].includes(target.type)) throw new AppError(400, 'TODAY_REQUIRES_DATE', 'Set Today can only target a Date field.');
  if (input.actionType === 'set_value') await validateAutomationValue(target, String(input.actionValue));
  const [result] = await pool.execute(`INSERT INTO common_form_automations
    (common_form_id, source_field_id, condition_type, condition_value, target_field_id, action_type, action_value)
    VALUES (?, ?, ?, ?, ?, ?, ?)`, [formId, sourceId, input.conditionType, input.conditionValue ?? null, targetId, input.actionType, input.actionType === 'set_value' ? String(input.actionValue) : null]);
  return (await listCommonAutomations(actor)).find((rule) => Number(rule.id) === Number(result.insertId));
}

export async function deleteCommonAutomation(actor, id) {
  const formId = await ensureCommonForm(actor);
  const [result] = await pool.execute('DELETE FROM common_form_automations WHERE id = ? AND common_form_id = ?', [assertIntegerId(id, 'automation id'), formId]);
  if (!result.affectedRows) throw new AppError(404, 'AUTOMATION_NOT_FOUND', 'Automation not found.');
}

export async function applyCommonAutomations(actor, values, previousValues = {}) {
  const rules = await getEffectiveCommonRules(actor);
  if (!rules.length) return values;
  return applyAutomationRules(rules, values, previousValues);
}

export async function getEffectiveCommonRules(actor) {
  const formId = await ensureCommonForm(actor);
  const [rules] = await pool.execute(`SELECT a.id, a.source_field_id, sf.\`key\` AS source_field_key, sf.type AS source_field_type,
    a.condition_type, a.condition_value, a.target_field_id, tf.\`key\` AS target_field_key, tf.type AS target_field_type,
    a.action_type, a.action_value
    FROM common_form_automations a JOIN field_definitions sf ON sf.id = a.source_field_id
    JOIN field_definitions tf ON tf.id = a.target_field_id
    WHERE a.common_form_id = ? AND a.is_active = 1 AND sf.is_active = 1 AND tf.is_active = 1 ORDER BY a.id ASC`, [formId]);
  return rules.map((rule) => ({
    id: rule.id,
    scope: 'common_form',
    sourceKey: rule.source_field_key,
    sourceType: rule.source_field_type,
    conditionType: rule.condition_type,
    conditionValue: rule.condition_value,
    targetKey: rule.target_field_key,
    targetType: rule.target_field_type,
    actionType: rule.action_type,
    actionValue: rule.action_value,
  }));
}
