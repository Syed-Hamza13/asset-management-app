import { pool, withTransaction } from '../../config/db.js';
import { AppError } from '../../utils/errors.js';
import { assertIntegerId } from '../../utils/validation.js';
import { ensureCommonForm, syncCommonFieldOrder } from './service.js';

// A common form belongs to exactly one user (uq_common_forms_owner) and every row it
// holds points at that user's own field definitions, so "copy to a user" has to be a
// deep, independent copy: fields (and their dropdowns with their options) that the
// target does not have yet are created in the target's account, and afterwards the two
// forms share no rows at all. A copy never overwrites work — it only runs against a
// target whose own common form is still empty.

async function readSourceSnapshot(actor) {
  const formId = await ensureCommonForm(actor);
  const [fields] = await pool.execute(
    `SELECT cff.field_definition_id AS id, cff.required, cff.show_in_list, cff.display_order,
      f.name, f.\`key\` AS field_key, f.type, f.dropdown_id,
      d.name AS dropdown_name, d.slug AS dropdown_slug
     FROM common_form_fields cff
     JOIN field_definitions f ON f.id = cff.field_definition_id
     LEFT JOIN dropdowns d ON d.id = f.dropdown_id
     WHERE cff.common_form_id = ? AND f.is_active = 1
     ORDER BY cff.display_order ASC, f.id ASC`,
    [formId],
  );
  const [rules] = await pool.execute(
    `SELECT source_field_id, condition_type, condition_value, target_field_id, action_type, action_value
     FROM common_form_automations WHERE common_form_id = ? AND is_active = 1 ORDER BY id ASC`,
    [formId],
  );
  const dropdownIds = [...new Set(fields.map((field) => field.dropdown_id).filter(Boolean))];
  const optionsByDropdown = new Map();
  if (dropdownIds.length) {
    const [options] = await pool.query(
      `SELECT dropdown_id, label, value, display_order FROM dropdown_options
       WHERE dropdown_id IN (${dropdownIds.map(() => '?').join(',')}) AND is_active = 1
       ORDER BY display_order ASC, id ASC`,
      dropdownIds,
    );
    for (const option of options) {
      if (!optionsByDropdown.has(option.dropdown_id)) optionsByDropdown.set(option.dropdown_id, []);
      optionsByDropdown.get(option.dropdown_id).push(option);
    }
  }
  return { fields, rules, optionsByDropdown };
}

// Dropdown identity is its slug within the owner, so an existing dropdown with the same
// slug is reused and only the missing option values are added: automation rules compare
// stored option values as strings, so every value the rules use must exist.
async function copyDropdown(conn, targetUserId, field, sourceOptions) {
  const [existing] = await conn.execute(
    'SELECT id FROM dropdowns WHERE owner_user_id = ? AND slug = ? LIMIT 1',
    [targetUserId, field.dropdown_slug],
  );
  if (existing.length) {
    const id = existing[0].id;
    for (const option of sourceOptions) {
      await conn.execute(
        'INSERT IGNORE INTO dropdown_options (dropdown_id, label, value, display_order) VALUES (?, ?, ?, ?)',
        [id, option.label, option.value, option.display_order],
      );
    }
    return { id, created: false };
  }
  const [result] = await conn.execute(
    'INSERT INTO dropdowns (name, slug, owner_user_id) VALUES (?, ?, ?)',
    [field.dropdown_name, field.dropdown_slug, targetUserId],
  );
  for (const option of sourceOptions) {
    await conn.execute(
      'INSERT INTO dropdown_options (dropdown_id, label, value, display_order) VALUES (?, ?, ?, ?)',
      [result.insertId, option.label, option.value, option.display_order],
    );
  }
  return { id: result.insertId, created: true };
}

// Field identity is its key within the owner. A key the target already owns is reused
// only when it is the same kind of field on the same dropdown source; otherwise the
// copy stops with a reason instead of silently reshaping their data.
async function copyField(conn, targetUserId, field, dropdownId) {
  const [existing] = await conn.execute(
    'SELECT id, type, dropdown_id, is_active FROM field_definitions WHERE owner_user_id = ? AND `key` = ? LIMIT 1',
    [targetUserId, field.field_key],
  );
  if (existing.length) {
    const row = existing[0];
    if (row.type !== field.type)
      throw new AppError(409, 'TARGET_FIELD_CONFLICT', `"${field.field_key}" already exists in their account as a ${row.type} field.`);
    if (field.type === 'dropdown' && Number(row.dropdown_id || 0) !== Number(dropdownId || 0))
      throw new AppError(409, 'TARGET_FIELD_CONFLICT', `"${field.field_key}" already uses a different dropdown in their account.`);
    if (!row.is_active) await conn.execute('UPDATE field_definitions SET is_active = 1 WHERE id = ?', [row.id]);
    return { id: row.id, created: false, reactivated: !row.is_active };
  }
  const [result] = await conn.execute(
    'INSERT INTO field_definitions (name, `key`, type, dropdown_id, owner_user_id) VALUES (?, ?, ?, ?, ?)',
    [field.name, field.field_key, field.type, dropdownId, targetUserId],
  );
  return { id: result.insertId, created: true, reactivated: false };
}

async function applyCopy(conn, target, source) {
  const targetActor = { id: target.id, email: target.email, role: 'user', isAdmin: false, permissions: [] };
  const formId = await ensureCommonForm(targetActor, conn);
  const [[{ fieldCount }]] = await conn.execute(
    'SELECT COUNT(*) AS fieldCount FROM common_form_fields WHERE common_form_id = ?',
    [formId],
  );
  const [[{ ruleCount }]] = await conn.execute(
    'SELECT COUNT(*) AS ruleCount FROM common_form_automations WHERE common_form_id = ?',
    [formId],
  );
  if (Number(fieldCount) > 0 || Number(ruleCount) > 0)
    throw new AppError(409, 'TARGET_FORM_NOT_EMPTY', 'Their common form already has fields, so nothing was copied into it.');

  const fieldMap = new Map();
  const counters = { fieldsCreated: 0, fieldsReused: 0, fieldsReactivated: 0, dropdownsCreated: 0 };
  for (const field of source.fields) {
    let dropdownId = null;
    if (field.type === 'dropdown' && field.dropdown_id) {
      const dropdown = await copyDropdown(conn, target.id, field, source.optionsByDropdown.get(field.dropdown_id) ?? []);
      if (dropdown.created) counters.dropdownsCreated += 1;
      dropdownId = dropdown.id;
    }
    const mapped = await copyField(conn, target.id, field, dropdownId);
    if (mapped.created) counters.fieldsCreated += 1;
    else {
      counters.fieldsReused += 1;
      if (mapped.reactivated) counters.fieldsReactivated += 1;
    }
    fieldMap.set(Number(field.id), mapped.id);
  }

  for (const field of source.fields) {
    await conn.execute(
      `INSERT INTO common_form_fields (common_form_id, field_definition_id, required, show_in_list, display_order)
       VALUES (?, ?, ?, ?, ?)`,
      [formId, fieldMap.get(Number(field.id)), Boolean(field.required), field.type === 'quantity' ? false : Boolean(field.show_in_list), field.display_order],
    );
  }

  const rulesSkipped = source.rules.filter(
    (rule) => !fieldMap.has(Number(rule.source_field_id)) || !fieldMap.has(Number(rule.target_field_id)),
  ).length;
  let rulesCopied = 0;
  for (const rule of source.rules) {
    const sourceFieldId = fieldMap.get(Number(rule.source_field_id));
    const targetFieldId = fieldMap.get(Number(rule.target_field_id));
    if (!sourceFieldId || !targetFieldId) continue;
    await conn.execute(
      `INSERT INTO common_form_automations
        (common_form_id, source_field_id, condition_type, condition_value, target_field_id, action_type, action_value)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [formId, sourceFieldId, rule.condition_type, rule.condition_value, targetFieldId, rule.action_type, rule.action_value],
    );
    rulesCopied += 1;
  }

  await syncCommonFieldOrder(targetActor, conn, formId);
  return {
    fieldsCopied: source.fields.length,
    rulesCopied,
    rulesSkipped,
    ...counters,
  };
}

// Admin view of who may receive a copy, with the reason a user is not eligible.
export async function listCopyTargets(actor) {
  const [rows] = await pool.query(
    `SELECT u.id, u.email, u.display_name,
      (SELECT COUNT(*) FROM common_form_fields cff JOIN common_forms cf ON cf.id = cff.common_form_id WHERE cf.owner_user_id = u.id) AS field_count,
      (SELECT COUNT(*) FROM common_form_automations cfa JOIN common_forms cf ON cf.id = cfa.common_form_id WHERE cf.owner_user_id = u.id) AS rule_count
     FROM users u WHERE u.is_active = 1 AND u.role <> 'admin' AND u.id <> ? ORDER BY u.email ASC`,
    [actor.id],
  );
  return rows.map((row) => ({
    userId: Number(row.id),
    email: row.email,
    displayName: row.display_name || null,
    fieldCount: Number(row.field_count),
    ruleCount: Number(row.rule_count),
    ready: Number(row.field_count) === 0,
  }));
}

export async function copyCommonFormToUsers(actor, userIds) {
  const ids = [...new Set(userIds.map((id) => Number(assertIntegerId(id, 'user id'))))].filter((id) => id !== Number(actor.id));
  if (!ids.length) throw new AppError(400, 'NO_COPY_TARGETS', 'Pick at least one user to copy to.');
  const [rows] = await pool.query(`SELECT id, email, display_name, role, is_active FROM users WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
  const found = new Map(rows.map((row) => [Number(row.id), row]));
  const source = await readSourceSnapshot(actor);

  const results = [];
  for (const id of ids) {
    const target = found.get(id);
    if (!target) {
      results.push({ userId: id, ok: false, reason: 'That user no longer exists.' });
      continue;
    }
    const label = { userId: id, email: target.email, displayName: target.display_name || null };
    if (target.role === 'admin') {
      results.push({ ...label, ok: false, reason: 'Admins keep their own common form.' });
      continue;
    }
    if (!target.is_active) {
      results.push({ ...label, ok: false, reason: 'That user is deactivated.' });
      continue;
    }
    try {
      const outcome = await withTransaction((conn) => applyCopy(conn, target, source));
      results.push({ ...label, ok: true, ...outcome });
    } catch (error) {
      if (!(error instanceof AppError)) console.warn('[common-form copy] unexpected failure for user', id, error);
      results.push({ ...label, ok: false, reason: error instanceof AppError ? error.message : 'Copy failed.' });
    }
  }
  return { source: { fieldCount: source.fields.length, ruleCount: source.rules.length }, results };
}
