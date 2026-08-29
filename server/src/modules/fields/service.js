import { pool } from '../../config/db.js';
import { AppError } from '../../utils/errors.js';
import { fieldKey } from '../../utils/slug.js';
import { FIELD_TYPES, assertIntegerId } from '../../utils/validation.js';

export async function listFields() {
  const [rows] = await pool.execute(`SELECT f.id, f.name, f.\`key\` AS field_key, f.type, f.dropdown_id, f.is_active, d.name AS dropdown_name,
    (SELECT COUNT(*) FROM asset_type_fields atf WHERE atf.field_definition_id = f.id) AS form_usage_count
    FROM field_definitions f LEFT JOIN dropdowns d ON d.id = f.dropdown_id ORDER BY f.name ASC`);
  return rows.map(r => ({ ...r, field_key: r.field_key }));
}

export async function createField({ name, key, type, dropdownId }) {
  if (!FIELD_TYPES.has(type)) throw new AppError(400, 'INVALID_FIELD_TYPE', 'Unsupported field type.');
  if (type === 'dropdown') {
    if (!dropdownId) throw new AppError(400, 'DROPDOWN_REQUIRED', 'Dropdown field requires a dropdown source.');
    const [d] = await pool.execute('SELECT id FROM dropdowns WHERE id = ? AND is_active = 1', [assertIntegerId(dropdownId, 'dropdown id')]);
    if (!d.length) throw new AppError(400, 'DROPDOWN_NOT_FOUND', 'Dropdown not found.');
  } else dropdownId = null;
  const normalizedKey = fieldKey(key || name);
  if (!normalizedKey) throw new AppError(400, 'INVALID_FIELD_KEY', 'Field key is invalid.');
  try {
    const [r] = await pool.execute('INSERT INTO field_definitions (name, `key`, type, dropdown_id) VALUES (?, ?, ?, ?)', [name, normalizedKey, type, dropdownId]);
    return getField(r.insertId);
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') throw new AppError(409, 'FIELD_KEY_EXISTS', 'A field with this key already exists.');
    throw e;
  }
}

export async function getField(id) {
  const idN = assertIntegerId(id, 'field id');
  const [rows] = await pool.execute('SELECT id, name, `key` AS field_key, type, dropdown_id, is_active FROM field_definitions WHERE id = ?', [idN]);
  if (!rows.length) throw new AppError(404, 'FIELD_NOT_FOUND', 'Field definition not found.');
  return rows[0];
}

export async function updateField(id, { name, key, type, dropdownId, isActive }) {
  const idN = assertIntegerId(id, 'field id');
  const existing = await getField(idN);
  if (fieldKey(key || existing.field_key) !== existing.field_key) throw new AppError(409, 'FIELD_KEY_IMMUTABLE', 'Internal field key cannot be changed after creation.');
  if (!FIELD_TYPES.has(type)) throw new AppError(400, 'INVALID_FIELD_TYPE', 'Unsupported field type.');
  const [[ref]] = await pool.execute('SELECT COUNT(*) AS count FROM asset_type_fields WHERE field_definition_id = ?', [idN]);
  if (Number(ref.count) > 0 && type !== existing.type) throw new AppError(409, 'FIELD_TYPE_IN_USE', 'Field type cannot change while the field is used by an asset form.');
  if (type === 'dropdown') {
    if (!dropdownId) throw new AppError(400, 'DROPDOWN_REQUIRED', 'Dropdown field requires a dropdown source.');
    const [d] = await pool.execute('SELECT id FROM dropdowns WHERE id = ?', [assertIntegerId(dropdownId, 'dropdown id')]);
    if (!d.length) throw new AppError(400, 'DROPDOWN_NOT_FOUND', 'Dropdown not found.');
  } else dropdownId = null;
  if (Number(ref.count) > 0 && Number(dropdownId || 0) !== Number(existing.dropdown_id || 0)) throw new AppError(409, 'FIELD_SOURCE_IN_USE', 'Dropdown source cannot change while the field is used by an asset form.');
  await pool.execute('UPDATE field_definitions SET name = ?, type = ?, dropdown_id = ?, is_active = ? WHERE id = ?', [name, type, dropdownId, Boolean(isActive), idN]);
  return getField(idN);
}

export async function deleteField(id) {
  const idN = assertIntegerId(id, 'field id');
  const [[ref]] = await pool.execute('SELECT COUNT(*) AS count FROM asset_type_fields WHERE field_definition_id = ?', [idN]);
  if (Number(ref.count) > 0) throw new AppError(409, 'FIELD_IN_USE', 'Field is used by an asset form. Remove it from forms first.');
  const [result] = await pool.execute('UPDATE field_definitions SET is_active = 0 WHERE id = ?', [idN]);
  if (!result.affectedRows) throw new AppError(404, 'FIELD_NOT_FOUND', 'Field definition not found.');
}
