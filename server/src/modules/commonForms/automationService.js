import { pool } from '../../config/db.js';
import { AppError } from '../../utils/errors.js';
import { assertIntegerId, validateFieldValue } from '../../utils/validation.js';
import { indiaToday } from '../../utils/dateTime.js';

const FORM_ID = 1;
const CONDITIONS = new Set(['filled', 'empty', 'changed', 'equals']);
const ACTIONS = new Set(['set_value', 'set_today']);

async function getFields() {
  const [rows] = await pool.execute(`SELECT f.id, f.name, f.\`key\` AS field_key, f.type, f.dropdown_id
    FROM common_form_fields cff JOIN field_definitions f ON f.id = cff.field_definition_id
    WHERE cff.common_form_id = ? AND f.is_active = 1`, [FORM_ID]);
  return rows;
}

export async function listCommonAutomations() {
  const [rows] = await pool.execute(`SELECT a.id, a.source_field_id, sf.name AS source_field_name,
    sf.type AS source_field_type, sf.dropdown_id AS source_dropdown_id, a.condition_type, a.condition_value, a.target_field_id,
    tf.name AS target_field_name, tf.type AS target_field_type, tf.dropdown_id AS target_dropdown_id, a.action_type, a.action_value
    FROM common_form_automations a JOIN field_definitions sf ON sf.id = a.source_field_id
    JOIN field_definitions tf ON tf.id = a.target_field_id
    WHERE a.common_form_id = ? ORDER BY a.id ASC`, [FORM_ID]);
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

export async function createCommonAutomation(input) {
  const sourceId = assertIntegerId(input.sourceFieldId, 'source field id');
  const targetId = assertIntegerId(input.targetFieldId, 'target field id');
  if (!CONDITIONS.has(input.conditionType)) throw new AppError(400, 'INVALID_AUTOMATION_CONDITION', 'Invalid automation condition.');
  if (!ACTIONS.has(input.actionType)) throw new AppError(400, 'INVALID_AUTOMATION_ACTION', 'Invalid automation action.');
  const fields = await getFields();
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
    VALUES (?, ?, ?, ?, ?, ?, ?)`, [FORM_ID, sourceId, input.conditionType, input.conditionValue ?? null, targetId, input.actionType, input.actionType === 'set_value' ? String(input.actionValue) : null]);
  return (await listCommonAutomations()).find((rule) => Number(rule.id) === Number(result.insertId));
}

export async function deleteCommonAutomation(id) {
  const [result] = await pool.execute('DELETE FROM common_form_automations WHERE id = ?', [assertIntegerId(id, 'automation id')]);
  if (!result.affectedRows) throw new AppError(404, 'AUTOMATION_NOT_FOUND', 'Automation not found.');
}

export async function applyCommonAutomations(values, previousValues = {}) {
  const [rules] = await pool.execute(`SELECT source_field_id, condition_type, condition_value,
    target_field_id, action_type, action_value FROM common_form_automations
    WHERE common_form_id = ? AND is_active = 1 ORDER BY id ASC`, [FORM_ID]);
  if (!rules.length) return values;
  const fields = await getFields();
  const byId = new Map(fields.map((field) => [Number(field.id), field]));
  const result = { ...values };
  for (const rule of rules) {
    const source = byId.get(Number(rule.source_field_id)); const target = byId.get(Number(rule.target_field_id));
    if (!source || !target) continue;
    const sourceValue = result[source.field_key];
    const filled = sourceValue !== undefined && sourceValue !== null && sourceValue !== '';
    const matches = rule.condition_type === 'filled' ? filled : rule.condition_type === 'empty' ? !filled : rule.condition_type === 'changed' ? String(sourceValue ?? '') !== String(previousValues[source.field_key] ?? '') : String(sourceValue ?? '') === String(rule.condition_value ?? '');
    if (!matches) continue;
    if (rule.action_type === 'set_today') result[target.field_key] = indiaToday();
    else { let value = rule.action_value; if (target.type === 'number') value = Number(value); if (target.type === 'boolean') value = value === 'true'; result[target.field_key] = value; }
  }
  return result;
}
