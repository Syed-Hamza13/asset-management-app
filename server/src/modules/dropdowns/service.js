import { pool, withTransaction } from '../../config/db.js';
import { AppError } from '../../utils/errors.js';
import { slugify } from '../../utils/slug.js';
import { assertIntegerId } from '../../utils/validation.js';
import { ownerScope } from '../../utils/scope.js';

export async function listDropdowns(actor) {
  const scope = ownerScope(actor, 'd.owner_user_id');
  const [rows] = await pool.execute(`SELECT d.id, d.name, d.slug, d.is_active,
    (SELECT COUNT(*) FROM dropdown_options o WHERE o.dropdown_id=d.id) AS option_count
    FROM dropdowns d WHERE 1=1${scope.sql} ORDER BY d.name ASC`, scope.params);
  return rows;
}

export async function getDropdown(actor, id) {
  const idN = assertIntegerId(id, 'dropdown id');
  const scope = ownerScope(actor);
  const [rows] = await pool.execute(`SELECT id, name, slug, is_active, owner_user_id FROM dropdowns WHERE id = ?${scope.sql}`, [idN, ...scope.params]);
  if (!rows.length) throw new AppError(404, 'DROPDOWN_NOT_FOUND', 'Dropdown not found.');
  const [options] = await pool.execute('SELECT id, label, value, display_order, is_active FROM dropdown_options WHERE dropdown_id = ? ORDER BY display_order, id', [idN]);
  return { ...rows[0], options };
}

export async function createDropdown(actor, name) {
  const slug = slugify(name);
  try {
    const [r] = await pool.execute('INSERT INTO dropdowns (name, slug, owner_user_id) VALUES (?, ?, ?)', [name, slug, actor.id]);
    return getDropdown(actor, r.insertId);
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') throw new AppError(409, 'DROPDOWN_EXISTS', 'A dropdown with this name already exists.');
    throw e;
  }
}

export async function updateDropdown(actor, id, name, isActive = true) {
  const idN = assertIntegerId(id, 'dropdown id');
  const scope = ownerScope(actor);
  try {
    const [r] = await pool.execute(`UPDATE dropdowns SET name = ?, slug = ?, is_active = ? WHERE id = ?${scope.sql}`, [name, slugify(name), Boolean(isActive), idN, ...scope.params]);
    if (!r.affectedRows) throw new AppError(404, 'DROPDOWN_NOT_FOUND', 'Dropdown not found.');
    return getDropdown(actor, idN);
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') throw new AppError(409, 'DROPDOWN_EXISTS', 'A dropdown with this name already exists.');
    throw e;
  }
}

export async function deleteDropdown(actor, id) {
  const idN = assertIntegerId(id, 'dropdown id');
  const scope = ownerScope(actor);
  const [[fieldRef]] = await pool.execute(`SELECT COUNT(*) AS count FROM field_definitions WHERE dropdown_id = ?${scope.sql}`, [idN, ...scope.params]);
  if (Number(fieldRef.count) > 0) throw new AppError(409, 'DROPDOWN_IN_USE', 'Dropdown is used by one or more fields.');
  const [r] = await pool.execute(`DELETE FROM dropdowns WHERE id = ?${scope.sql}`, [idN, ...scope.params]);
  if (!r.affectedRows) throw new AppError(404, 'DROPDOWN_NOT_FOUND', 'Dropdown not found.');
}

export async function addOption(actor, dropdownId, label, value, displayOrder = 0) {
  const idN = assertIntegerId(dropdownId, 'dropdown id');
  await getDropdown(actor, idN);
  try {
    const [r] = await pool.execute('INSERT INTO dropdown_options (dropdown_id, label, value, display_order) VALUES (?, ?, ?, ?)', [idN, label, value, displayOrder]);
    return r.insertId;
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') throw new AppError(409, 'OPTION_EXISTS', 'That option value already exists.');
    throw e;
  }
}

export async function updateOption(actor, dropdownId, optionId, { label, value, displayOrder, isActive }) {
  const d = assertIntegerId(dropdownId, 'dropdown id');
  const o = assertIntegerId(optionId, 'option id');
  const dropdown = await getDropdown(actor, d);
  const [[existing]] = await pool.execute('SELECT id, label, value FROM dropdown_options WHERE id = ? AND dropdown_id = ?', [o, d]);
  if (!existing) throw new AppError(404, 'OPTION_NOT_FOUND', 'Dropdown option not found.');
  try {
    await withTransaction(async (conn) => {
      await conn.execute('UPDATE dropdown_options SET label = ?, value = ?, display_order = ?, is_active = ? WHERE id = ? AND dropdown_id = ?', [label, value, displayOrder, Boolean(isActive), o, d]);
      if (existing.value === value) return;
      const [fieldRows] = await conn.execute('SELECT id, `key` AS field_key FROM field_definitions WHERE dropdown_id = ?', [d]);
      for (const field of fieldRows) {
        // Field keys are only unique per owner, so the value rewrite must stay
        // within the dropdown owner's assets.
        await conn.execute('UPDATE assets SET values_json = JSON_SET(values_json, CONCAT("$.", ?), ?) WHERE owner_user_id = ? AND JSON_UNQUOTE(JSON_EXTRACT(values_json, CONCAT("$.", ?))) = ?', [field.field_key, value, dropdown.owner_user_id, field.field_key, existing.value]);
        await conn.execute('UPDATE asset_automations SET condition_value = CASE WHEN source_field_id = ? AND condition_value = ? THEN ? ELSE condition_value END, action_value = CASE WHEN target_field_id = ? AND action_value = ? THEN ? ELSE action_value END WHERE (source_field_id = ? AND condition_value = ?) OR (target_field_id = ? AND action_value = ?)', [field.id, existing.value, value, field.id, existing.value, value, field.id, existing.value, field.id, existing.value]);
        await conn.execute('UPDATE common_form_automations SET condition_value = CASE WHEN source_field_id = ? AND condition_value = ? THEN ? ELSE condition_value END, action_value = CASE WHEN target_field_id = ? AND action_value = ? THEN ? ELSE action_value END WHERE (source_field_id = ? AND condition_value = ?) OR (target_field_id = ? AND action_value = ?)', [field.id, existing.value, value, field.id, existing.value, value, field.id, existing.value, field.id, existing.value]);
      }
    });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') throw new AppError(409, 'OPTION_EXISTS', 'That option value already exists.');
    throw e;
  }
  return getDropdown(actor, d);
}

export async function deleteOption(actor, dropdownId, optionId) {
  const d = assertIntegerId(dropdownId, 'dropdown id');
  const o = assertIntegerId(optionId, 'option id');
  await getDropdown(actor, d);
  const [r] = await pool.execute('UPDATE dropdown_options SET is_active = 0 WHERE id = ? AND dropdown_id = ?', [o, d]);
  if (!r.affectedRows) throw new AppError(404, 'OPTION_NOT_FOUND', 'Dropdown option not found.');
}
