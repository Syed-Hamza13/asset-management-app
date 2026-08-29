import { pool, withTransaction } from '../../config/db.js';
import { AppError } from '../../utils/errors.js';
import { slugify } from '../../utils/slug.js';
import { assertIntegerId } from '../../utils/validation.js';

export async function listDropdowns() {
  const [rows] = await pool.execute(`SELECT d.id, d.name, d.slug, d.is_active,
    (SELECT COUNT(*) FROM dropdown_options o WHERE o.dropdown_id=d.id) AS option_count
    FROM dropdowns d ORDER BY d.name ASC`);
  return rows;
}

export async function getDropdown(id) {
  const idN = assertIntegerId(id, 'dropdown id');
  const [rows] = await pool.execute('SELECT id, name, slug, is_active FROM dropdowns WHERE id = ?', [idN]);
  if (!rows.length) throw new AppError(404, 'DROPDOWN_NOT_FOUND', 'Dropdown not found.');
  const [options] = await pool.execute('SELECT id, label, value, display_order, is_active FROM dropdown_options WHERE dropdown_id = ? ORDER BY display_order, id', [idN]);
  return { ...rows[0], options };
}

export async function createDropdown(name) {
  const slug = slugify(name);
  try {
    const [r] = await pool.execute('INSERT INTO dropdowns (name, slug) VALUES (?, ?)', [name, slug]);
    return getDropdown(r.insertId);
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') throw new AppError(409, 'DROPDOWN_EXISTS', 'A dropdown with this name already exists.');
    throw e;
  }
}

export async function updateDropdown(id, name, isActive = true) {
  const idN = assertIntegerId(id, 'dropdown id');
  try {
    const [r] = await pool.execute('UPDATE dropdowns SET name = ?, slug = ?, is_active = ? WHERE id = ?', [name, slugify(name), Boolean(isActive), idN]);
    if (!r.affectedRows) throw new AppError(404, 'DROPDOWN_NOT_FOUND', 'Dropdown not found.');
    return getDropdown(idN);
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') throw new AppError(409, 'DROPDOWN_EXISTS', 'A dropdown with this name already exists.');
    throw e;
  }
}

export async function deleteDropdown(id) {
  const idN = assertIntegerId(id, 'dropdown id');
  const [[fieldRef]] = await pool.execute('SELECT COUNT(*) AS count FROM field_definitions WHERE dropdown_id = ?', [idN]);
  if (Number(fieldRef.count) > 0) throw new AppError(409, 'DROPDOWN_IN_USE', 'Dropdown is used by one or more fields.');
  const [r] = await pool.execute('DELETE FROM dropdowns WHERE id = ?', [idN]);
  if (!r.affectedRows) throw new AppError(404, 'DROPDOWN_NOT_FOUND', 'Dropdown not found.');
}

export async function addOption(dropdownId, label, value, displayOrder = 0) {
  const idN = assertIntegerId(dropdownId, 'dropdown id');
  await getDropdown(idN);
  try {
    const [r] = await pool.execute('INSERT INTO dropdown_options (dropdown_id, label, value, display_order) VALUES (?, ?, ?, ?)', [idN, label, value, displayOrder]);
    return r.insertId;
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') throw new AppError(409, 'OPTION_EXISTS', 'That option value already exists.');
    throw e;
  }
}

export async function updateOption(dropdownId, optionId, { label, value, displayOrder, isActive }) {
  const d = assertIntegerId(dropdownId, 'dropdown id');
  const o = assertIntegerId(optionId, 'option id');
  const [[existing]] = await pool.execute('SELECT id, label, value FROM dropdown_options WHERE id = ? AND dropdown_id = ?', [o, d]);
  if (!existing) throw new AppError(404, 'OPTION_NOT_FOUND', 'Dropdown option not found.');
  try {
    await withTransaction(async (conn) => {
      await conn.execute('UPDATE dropdown_options SET label = ?, value = ?, display_order = ?, is_active = ? WHERE id = ? AND dropdown_id = ?', [label, value, displayOrder, Boolean(isActive), o, d]);
      if (existing.value === value) return;
      const [fieldRows] = await conn.execute('SELECT id, `key` AS field_key FROM field_definitions WHERE dropdown_id = ?', [d]);
      for (const field of fieldRows) {
        await conn.execute('UPDATE assets SET values_json = JSON_SET(values_json, CONCAT("$.", ?), ?) WHERE JSON_UNQUOTE(JSON_EXTRACT(values_json, CONCAT("$.", ?))) = ?', [field.field_key, value, field.field_key, existing.value]);
        await conn.execute('UPDATE asset_automations SET condition_value = CASE WHEN source_field_id = ? AND condition_value = ? THEN ? ELSE condition_value END, action_value = CASE WHEN target_field_id = ? AND action_value = ? THEN ? ELSE action_value END WHERE (source_field_id = ? AND condition_value = ?) OR (target_field_id = ? AND action_value = ?)', [field.id, existing.value, value, field.id, existing.value, value, field.id, existing.value, field.id, existing.value]);
        await conn.execute('UPDATE common_form_automations SET condition_value = CASE WHEN source_field_id = ? AND condition_value = ? THEN ? ELSE condition_value END, action_value = CASE WHEN target_field_id = ? AND action_value = ? THEN ? ELSE action_value END WHERE (source_field_id = ? AND condition_value = ?) OR (target_field_id = ? AND action_value = ?)', [field.id, existing.value, value, field.id, existing.value, value, field.id, existing.value, field.id, existing.value]);
      }
    });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') throw new AppError(409, 'OPTION_EXISTS', 'That option value already exists.');
    throw e;
  }
  return getDropdown(d);
}

export async function deleteOption(dropdownId, optionId) {
  const d = assertIntegerId(dropdownId, 'dropdown id');
  const o = assertIntegerId(optionId, 'option id');
  const [r] = await pool.execute('UPDATE dropdown_options SET is_active = 0 WHERE id = ? AND dropdown_id = ?', [o, d]);
  if (!r.affectedRows) throw new AppError(404, 'OPTION_NOT_FOUND', 'Dropdown option not found.');
}
