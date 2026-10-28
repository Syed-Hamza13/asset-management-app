import { pool } from '../../config/db.js';
import { AppError } from '../../utils/errors.js';
import { assertIntegerId, validateFieldValue } from '../../utils/validation.js';
import { ownerScope } from '../../utils/scope.js';
import { applyAutomationRules } from '../../../../shared/automationRules.js';
import { getEffectiveCommonRules } from '../commonForms/automationService.js';
import { getAssetType } from '../assetTypes/service.js';

const CONDITIONS = new Set(['filled', 'empty', 'changed', 'equals']);
const ACTIONS = new Set(['set_value', 'set_today', 'clear']);

export async function listAutomations(actor, assetTypeId) {
  const id = assertIntegerId(assetTypeId, 'asset type id');
  await getAssetType(actor, id);
  const [rows] = await pool.execute(`SELECT a.id, a.source_field_id, sf.name AS source_field_name, sf.\`key\` AS source_field_key,
      sf.type AS source_field_type, sf.dropdown_id AS source_dropdown_id, a.condition_type, a.condition_value, a.target_field_id,
      tf.name AS target_field_name, tf.\`key\` AS target_field_key, tf.type AS target_field_type, tf.dropdown_id AS target_dropdown_id,
      a.action_type, a.action_value, a.is_active
    FROM asset_automations a
    JOIN field_definitions sf ON sf.id = a.source_field_id
    JOIN field_definitions tf ON tf.id = a.target_field_id
    WHERE a.asset_type_id = ? ORDER BY a.id ASC`, [id]);
  return rows;
}

async function getFormField(assetTypeId, fieldId) {
  const [rows] = await pool.execute(`SELECT f.id, f.name, f.\`key\` AS field_key, f.type, f.dropdown_id
    FROM asset_type_fields atf JOIN field_definitions f ON f.id = atf.field_definition_id
    WHERE atf.asset_type_id = ? AND f.id = ? AND f.is_active = 1`, [assetTypeId, fieldId]);
  return rows[0] || null;
}

export async function createAutomation(actor, assetTypeId, input) {
  const id = assertIntegerId(assetTypeId, 'asset type id');
  await getAssetType(actor, id);
  const sourceId = assertIntegerId(input.sourceFieldId, 'source field id');
  const targetId = assertIntegerId(input.targetFieldId, 'target field id');
  if (!CONDITIONS.has(input.conditionType)) throw new AppError(400, 'INVALID_AUTOMATION_CONDITION', 'Invalid automation condition.');
  if (!ACTIONS.has(input.actionType)) throw new AppError(400, 'INVALID_AUTOMATION_ACTION', 'Invalid automation action.');
  const source = await getFormField(id, sourceId);
  const target = await getFormField(id, targetId);
  if (!source || !target) throw new AppError(400, 'AUTOMATION_FIELD_NOT_IN_FORM', 'Source and target fields must belong to this asset form.');
  if (source.id === target.id && input.actionType === 'set_value') throw new AppError(400, 'INVALID_AUTOMATION', 'A field cannot set itself from its own rule.');
  if (input.conditionType === 'equals' && input.conditionValue === undefined) throw new AppError(400, 'CONDITION_VALUE_REQUIRED', 'Condition value is required.');
  if (input.actionType === 'set_value' && (input.actionValue === undefined || input.actionValue === null)) throw new AppError(400, 'ACTION_VALUE_REQUIRED', 'Action value is required.');
  if (input.actionType === 'set_today' && !['date', 'auto_date'].includes(target.type)) throw new AppError(400, 'TODAY_REQUIRES_DATE', 'Set Today can only target a Date field.');
  if (input.actionType === 'set_value') await validateAutomationValue(target, String(input.actionValue));
  const [r] = await pool.execute(`INSERT INTO asset_automations
    (asset_type_id, source_field_id, condition_type, condition_value, target_field_id, action_type, action_value)
    VALUES (?, ?, ?, ?, ?, ?, ?)`, [id, sourceId, input.conditionType, input.conditionValue ?? null, targetId, input.actionType, input.actionType === 'set_value' ? String(input.actionValue) : null]);
  return (await listAutomations(actor, id)).find(x => Number(x.id) === Number(r.insertId));
}

export async function deleteAutomation(actor, id) {
  const n = assertIntegerId(id, 'automation id');
  const scope = ownerScope(actor, 'at.owner_user_id');
  const [r] = await pool.execute(
    `DELETE a FROM asset_automations a JOIN asset_types at ON at.id = a.asset_type_id WHERE a.id = ?${scope.sql}`,
    [n, ...scope.params],
  );
  if (!r.affectedRows) throw new AppError(404, 'AUTOMATION_NOT_FOUND', 'Automation not found.');
}

async function validateAutomationValue(field, value) {
  let options = new Set();
  if (field.type === 'dropdown') {
    const [rows] = await pool.execute('SELECT value FROM dropdown_options WHERE dropdown_id = ? AND is_active = 1', [field.dropdown_id]);
    options = new Set(rows.map(x => x.value));
  }
  let parsed = value;
  if (field.type === 'number') parsed = Number(value);
  if (field.type === 'boolean') parsed = value === 'true';
  validateFieldValue(field, parsed, options);
}

export async function applyAutomations(actor, assetTypeId, values, previousValues = {}) {
  const rules = await getEffectiveAssetRules(actor, assetTypeId);
  if (!rules.length) return values;
  return applyAutomationRules(rules, values, previousValues);
}

export async function getEffectiveAssetRules(actor, assetTypeId) {
  const id = assertIntegerId(assetTypeId, 'asset type id');
  const [rules] = await pool.execute(`SELECT a.id, a.source_field_id, a.condition_type, a.condition_value, a.target_field_id, a.action_type, a.action_value
    FROM asset_automations a WHERE a.asset_type_id = ? AND a.is_active = 1 ORDER BY a.id ASC`, [id]);
  if (!rules.length) return [];
  const [fields] = await pool.execute(`SELECT f.id, f.name, f.\`key\` AS field_key, f.type, f.dropdown_id
    FROM asset_type_fields atf JOIN field_definitions f ON f.id = atf.field_definition_id
    WHERE atf.asset_type_id = ?`, [id]);
  const byId = new Map(fields.map(f => [Number(f.id), f]));
  const mapped = [];
  for (const rule of rules) {
    const source = byId.get(Number(rule.source_field_id));
    const target = byId.get(Number(rule.target_field_id));
    if (!source || !target) continue;
    mapped.push({
      id: rule.id,
      scope: 'asset_type',
      sourceKey: source.field_key,
      sourceType: source.type,
      conditionType: rule.condition_type,
      conditionValue: rule.condition_value,
      targetKey: target.field_key,
      targetType: target.type,
      actionType: rule.action_type,
      actionValue: rule.action_value,
    });
  }
  return mapped;
}

export async function getEffectiveAutomations(actor, assetTypeId) {
  const [commonRules, assetRules] = await Promise.all([
    getEffectiveCommonRules(actor),
    getEffectiveAssetRules(actor, assetTypeId),
  ]);
  return [...commonRules, ...assetRules];
}
