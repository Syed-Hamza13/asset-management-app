import { pool, withTransaction } from '../../config/db.js';
import { AppError } from '../../utils/errors.js';
import { assertIntegerId } from '../../utils/validation.js';

const COMMON_FORM_ID = 1;

export async function getCommonForm() {
  const [rows] = await pool.execute(`SELECT cff.field_definition_id AS id, f.name, f.\`key\` AS field_key,
    f.type, f.dropdown_id, cff.required, cff.show_in_list, cff.display_order
    FROM common_form_fields cff JOIN field_definitions f ON f.id = cff.field_definition_id
    WHERE cff.common_form_id = ? AND f.is_active = 1
    ORDER BY cff.display_order ASC, f.id ASC`, [COMMON_FORM_ID]);
  return rows.map((row) => ({ ...row, showInList: Boolean(row.show_in_list), required: Boolean(row.required) }));
}

export async function saveCommonForm(fields) {
  return withTransaction(async (conn) => {
    const [previousFields] = await conn.execute(
      'SELECT field_definition_id FROM common_form_fields WHERE common_form_id = ?',
      [COMMON_FORM_ID],
    );
    const nextFieldIds = new Set(fields.map((field) => Number(field.fieldDefinitionId)));
    const removedFieldIds = previousFields
      .map((field) => field.field_definition_id)
      .filter((fieldId) => !nextFieldIds.has(Number(fieldId)));
    await conn.execute('DELETE FROM common_form_fields WHERE common_form_id = ?', [COMMON_FORM_ID]);
    for (let index = 0; index < fields.length; index += 1) {
      const fieldId = assertIntegerId(fields[index].fieldDefinitionId, 'field definition id');
      const [definitions] = await conn.execute('SELECT id, is_active, type FROM field_definitions WHERE id = ? LIMIT 1', [fieldId]);
      if (!definitions.length || !definitions[0].is_active)
        throw new AppError(400, 'INVALID_FIELD', 'Selected field definition is unavailable.');
      await conn.execute(`INSERT INTO common_form_fields
        (common_form_id, field_definition_id, required, show_in_list, display_order)
        VALUES (?, ?, ?, ?, ?)`, [COMMON_FORM_ID, fieldId, Boolean(fields[index].required), definitions[0].type === 'quantity' ? false : Boolean(fields[index].showInList), index]);
    }
    for (const fieldId of removedFieldIds) {
      await conn.execute(
        'DELETE FROM asset_type_fields WHERE field_definition_id = ?',
        [fieldId],
      );
    }
    await syncCommonFieldOrder(conn);
    return getCommonForm();
  });
}

async function syncCommonFieldOrder(conn) {
  const [assetTypes] = await conn.execute('SELECT id FROM asset_types');
  const [commonFields] = await conn.execute(
    'SELECT field_definition_id, required, show_in_list, display_order FROM common_form_fields WHERE common_form_id = ? ORDER BY display_order, id',
    [COMMON_FORM_ID],
  );
  const commonOrder = new Map(commonFields.map((field) => [field.field_definition_id, field.display_order]));

  for (const assetType of assetTypes) {
    await attachCommonFields(assetType.id, conn);
    const [formFields] = await conn.execute(
      'SELECT id, field_definition_id, display_order FROM asset_type_fields WHERE asset_type_id = ? ORDER BY display_order, id',
      [assetType.id],
    );
    const ordered = formFields.sort((a, b) => {
      const aOrder = commonOrder.has(a.field_definition_id) ? commonOrder.get(a.field_definition_id) : commonFields.length + a.display_order;
      const bOrder = commonOrder.has(b.field_definition_id) ? commonOrder.get(b.field_definition_id) : commonFields.length + b.display_order;
      return aOrder - bOrder || a.id - b.id;
    });
    for (let index = 0; index < ordered.length; index += 1) {
      const commonField = commonFields.find((field) => field.field_definition_id === ordered[index].field_definition_id);
      if (commonField) {
        await conn.execute(
          'UPDATE asset_type_fields SET required = ?, show_in_list = ?, display_order = ? WHERE id = ?',
          [commonField.required, commonField.show_in_list, index, ordered[index].id],
        );
      } else {
        await conn.execute('UPDATE asset_type_fields SET display_order = ? WHERE id = ?', [index, ordered[index].id]);
      }
    }
  }
}

export async function attachCommonFields(assetTypeId, conn = pool) {
  const typeId = assertIntegerId(assetTypeId, 'asset type id');
  const [fields] = await conn.execute('SELECT field_definition_id, required, show_in_list, display_order FROM common_form_fields WHERE common_form_id = ? ORDER BY display_order, id', [COMMON_FORM_ID]);
  for (const field of fields) {
    await conn.execute(`INSERT IGNORE INTO asset_type_fields
      (asset_type_id, field_definition_id, required, show_in_list, display_order)
      VALUES (?, ?, ?, ?, ?)`, [typeId, field.field_definition_id, field.required, field.show_in_list, field.display_order]);
  }
}
