import { pool, withTransaction } from '../../config/db.js';
import { AppError } from '../../utils/errors.js';
import { fieldKey } from '../../utils/slug.js';
import { FIELD_TYPES, assertIntegerId, validateFieldValue } from '../../utils/validation.js';
import { ownerScope } from '../../utils/scope.js';

export async function listFields(actor) {
  const scope = ownerScope(actor, 'f.owner_user_id');
  const [rows] = await pool.execute(`SELECT f.id, f.name, f.\`key\` AS field_key, f.type, f.dropdown_id, f.is_active, d.name AS dropdown_name,
    (SELECT COUNT(*) FROM asset_type_fields atf WHERE atf.field_definition_id = f.id) AS form_usage_count
    FROM field_definitions f LEFT JOIN dropdowns d ON d.id = f.dropdown_id WHERE 1=1${scope.sql} ORDER BY f.name ASC`, scope.params);
  return rows.map(r => ({ ...r, field_key: r.field_key }));
}

export async function createField(actor, { name, key, type, dropdownId }) {
  if (!FIELD_TYPES.has(type)) throw new AppError(400, 'INVALID_FIELD_TYPE', 'Unsupported field type.');
  if (type === 'dropdown') {
    if (!dropdownId) throw new AppError(400, 'DROPDOWN_REQUIRED', 'Dropdown field requires a dropdown source.');
    const scope = ownerScope(actor);
    const [d] = await pool.execute(`SELECT id FROM dropdowns WHERE id = ? AND is_active = 1${scope.sql}`, [assertIntegerId(dropdownId, 'dropdown id'), ...scope.params]);
    if (!d.length) throw new AppError(400, 'DROPDOWN_NOT_FOUND', 'Dropdown not found.');
  } else dropdownId = null;
  const normalizedKey = fieldKey(key || name);
  if (!normalizedKey) throw new AppError(400, 'INVALID_FIELD_KEY', 'Field key is invalid.');
  try {
    const [r] = await pool.execute('INSERT INTO field_definitions (name, `key`, type, dropdown_id, owner_user_id) VALUES (?, ?, ?, ?, ?)', [name, normalizedKey, type, dropdownId, actor.id]);
    return getField(actor, r.insertId);
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') throw new AppError(409, 'FIELD_KEY_EXISTS', 'A field with this key already exists.');
    throw e;
  }
}

export async function getField(actor, id) {
  const idN = assertIntegerId(id, 'field id');
  const scope = ownerScope(actor);
  const [rows] = await pool.execute(`SELECT id, name, \`key\` AS field_key, type, dropdown_id, is_active FROM field_definitions WHERE id = ?${scope.sql}`, [idN, ...scope.params]);
  if (!rows.length) throw new AppError(404, 'FIELD_NOT_FOUND', 'Field definition not found.');
  return rows[0];
}

async function usageCount(conn, fieldId) {
  const [[r]] = await conn.execute('SELECT COUNT(*) AS c FROM asset_type_fields WHERE field_definition_id = ?', [fieldId]);
  return Number(r.c);
}

function isEmptyValue(raw) {
  return raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '');
}

// Convert one stored value into the new type's canonical form, then validate it
// under that type. Returns { ok, value } or { ok:false, reason }.
function coerceValue(raw, toType) {
  let value;
  if (toType === 'number') {
    if (typeof raw === 'boolean') return { ok: false, reason: 'is Yes/No, not a number' };
    const n = Number(raw);
    if (!Number.isFinite(n)) return { ok: false, reason: 'is not a number' };
    value = n;
  } else if (toType === 'quantity') {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1 || n > 15) return { ok: false, reason: 'must be a whole number between 1 and 15' };
    value = n;
  } else if (toType === 'boolean') {
    if (typeof raw === 'boolean') value = raw;
    else {
      const s = String(raw).trim().toLowerCase();
      if (s === 'true' || s === '1') value = true;
      else if (s === 'false' || s === '0') value = false;
      else return { ok: false, reason: 'must be Yes or No' };
    }
  } else if (toType === 'date' || toType === 'auto_date') {
    const s = String(raw).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return { ok: false, reason: 'is not a valid date (YYYY-MM-DD)' };
    const d = new Date(`${s}T00:00:00Z`);
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return { ok: false, reason: 'is not a valid date' };
    value = s;
  } else {
    // text, multiline, mobile, dropdown -> store as string
    if (typeof raw === 'string') value = raw;
    else if (typeof raw === 'number' || typeof raw === 'boolean') value = String(raw);
    else return { ok: false, reason: 'cannot convert to text' };
  }
  try {
    validateFieldValue({ type: toType, name: 'value' }, value, new Set());
    return { ok: true, value };
  } catch (e) {
    return { ok: false, reason: (e.message || 'incompatible value').replace(/^value\s*/i, '').trim() };
  }
}

// Scan every asset value for this field key against the new type. Read-only.
async function scanMigration(conn, actor, fieldId, fieldKey, toType) {
  const scope = ownerScope(actor, 'a.owner_user_id');
  const [rows] = await conn.execute(
    `SELECT a.id, a.public_id, a.values_json, at.name AS asset_type_name
     FROM assets a
     JOIN asset_types at ON at.id = a.asset_type_id
     JOIN asset_type_fields atf ON atf.asset_type_id = a.asset_type_id AND atf.field_definition_id = ?
     WHERE 1=1${scope.sql}`,
    [fieldId, ...scope.params],
  );
  const issues = [];
  const updates = [];
  for (const row of rows) {
    const values = typeof row.values_json === 'string' ? JSON.parse(row.values_json) : row.values_json;
    if (!values || !Object.prototype.hasOwnProperty.call(values, fieldKey)) continue;
    const raw = values[fieldKey];
    if (isEmptyValue(raw)) continue; // keep blanks untouched
    const c = coerceValue(raw, toType);
    if (!c.ok) {
      issues.push({
        publicId: row.public_id,
        assetTypeName: row.asset_type_name,
        label: String(values.name ?? row.public_id),
        value: typeof raw === 'object' ? JSON.stringify(raw) : String(raw),
        reason: c.reason,
      });
      continue;
    }
    if (JSON.stringify(raw) !== JSON.stringify(c.value)) {
      updates.push({ id: row.id, values: { ...values, [fieldKey]: c.value } });
    }
  }
  return { issues, updates, scannedRows: rows.length };
}

async function collectReferences(conn, fieldId, fieldKey) {
  const [[assetAuto]] = await conn.execute('SELECT COUNT(*) AS c FROM asset_automations WHERE source_field_id = ? OR target_field_id = ?', [fieldId, fieldId]);
  const [[commonAuto]] = await conn.execute('SELECT COUNT(*) AS c FROM common_form_automations WHERE source_field_id = ? OR target_field_id = ?', [fieldId, fieldId]);
  const [[emailRules]] = await conn.execute('SELECT COUNT(*) AS c FROM email_rules WHERE trigger_field_id = ?', [fieldId]);
  const pattern = `%{{field.${fieldKey}%`;
  const [tpls] = await conn.execute('SELECT name FROM email_templates WHERE subject_template LIKE ? OR body_template LIKE ?', [pattern, pattern]);
  return {
    automationRules: Number(assetAuto.c) + Number(commonAuto.c),
    emailRules: Number(emailRules.c),
    templates: tpls.map((t) => t.name),
  };
}

// Read-only preview used by the client to show a confirmation prompt before a
// type change that will migrate data, rules and placeholders.
export async function previewTypeChange(actor, id, toType) {
  const idN = assertIntegerId(id, 'field id');
  const existing = await getField(actor, idN);
  if (!FIELD_TYPES.has(toType)) throw new AppError(400, 'INVALID_FIELD_TYPE', 'Unsupported field type.');
  if (existing.type === toType) return { change: false, from: existing.type, to: toType };
  const usage = await usageCount(pool, idN);
  if (usage === 0) {
    return { change: true, from: existing.type, to: toType, usage, migratable: true, needsDropdown: toType === 'dropdown', references: await collectReferences(pool, idN, existing.field_key) };
  }
  if (toType === 'dropdown') {
    return { change: true, from: existing.type, to: toType, usage, blocked: true, blockReason: 'This field is used by asset forms. To make it a Dropdown, remove it from every form first (a dropdown also needs a source list).' };
  }
  const [scan, references] = await Promise.all([
    scanMigration(pool, actor, idN, existing.field_key, toType),
    collectReferences(pool, idN, existing.field_key),
  ]);
  return {
    change: true,
    from: existing.type,
    to: toType,
    usage,
    migratable: scan.issues.length === 0,
    issueCount: scan.issues.length,
    issues: scan.issues.slice(0, 100),
    rowsToMigrate: scan.updates.length,
    scannedRows: scan.scannedRows,
    references,
  };
}

export async function updateField(actor, id, { name, key, type, dropdownId, isActive }) {
  const idN = assertIntegerId(id, 'field id');
  const existing = await getField(actor, idN);
  if (fieldKey(key || existing.field_key) !== existing.field_key) throw new AppError(409, 'FIELD_KEY_IMMUTABLE', 'Internal field key cannot be changed after creation.');
  if (!FIELD_TYPES.has(type)) throw new AppError(400, 'INVALID_FIELD_TYPE', 'Unsupported field type.');
  const usage = await usageCount(pool, idN);
  const changingType = type !== existing.type;
  const scope = ownerScope(actor);

  // Dropdown still requires a valid, owned source.
  if (type === 'dropdown') {
    if (!dropdownId) throw new AppError(400, 'DROPDOWN_REQUIRED', 'Dropdown field requires a dropdown source.');
    const [d] = await pool.execute(`SELECT id FROM dropdowns WHERE id = ? AND is_active = 1${scope.sql}`, [assertIntegerId(dropdownId, 'dropdown id'), ...scope.params]);
    if (!d.length) throw new AppError(400, 'DROPDOWN_NOT_FOUND', 'Dropdown not found.');
  } else {
    dropdownId = null;
  }

  if (changingType && type === 'dropdown' && usage > 0) {
    throw new AppError(409, 'FIELD_TYPE_IN_USE', 'Field type cannot become Dropdown while the field is used by an asset form. Remove it from forms first.');
  }
  if (usage > 0 && !changingType && Number(dropdownId || 0) !== Number(existing.dropdown_id || 0)) {
    throw new AppError(409, 'FIELD_SOURCE_IN_USE', 'Dropdown source cannot change while the field is used by an asset form.');
  }

  // Migration path: field is in use and the type is changing to a non-dropdown
  // type. Validate every stored value and coerce compatible ones.
  if (changingType && usage > 0) {
    await withTransaction(async (conn) => {
      const scan = await scanMigration(conn, actor, idN, existing.field_key, type);
      if (scan.issues.length) {
        throw new AppError(409, 'FIELD_TYPE_INCOMPATIBLE', `Cannot change this field's type: ${scan.issues.length} existing value(s) are incompatible. Fix or clear them first.`, { issues: scan.issues });
      }
      await conn.execute(`UPDATE field_definitions SET name = ?, type = ?, dropdown_id = ?, is_active = ? WHERE id = ?${scope.sql}`, [name, type, dropdownId, Boolean(isActive), idN, ...scope.params]);
      for (const u of scan.updates) {
        await conn.execute('UPDATE assets SET values_json = ? WHERE id = ?', [JSON.stringify(u.values), u.id]);
      }
    });
    return getField(actor, idN);
  }

  await pool.execute(`UPDATE field_definitions SET name = ?, type = ?, dropdown_id = ?, is_active = ? WHERE id = ?${scope.sql}`, [name, type, dropdownId, Boolean(isActive), idN, ...scope.params]);
  return getField(actor, idN);
}

export async function deleteField(actor, id) {
  const idN = assertIntegerId(id, 'field id');
  const [[ref]] = await pool.execute('SELECT COUNT(*) AS count FROM asset_type_fields WHERE field_definition_id = ?', [idN]);
  if (Number(ref.count) > 0) throw new AppError(409, 'FIELD_IN_USE', 'Field is used by an asset form. Remove it from forms first.');
  const scope = ownerScope(actor);
  const [result] = await pool.execute(`UPDATE field_definitions SET is_active = 0 WHERE id = ?${scope.sql}`, [idN, ...scope.params]);
  if (!result.affectedRows) throw new AppError(404, 'FIELD_NOT_FOUND', 'Field definition not found.');
}
