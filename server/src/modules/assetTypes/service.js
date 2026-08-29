import { pool, withTransaction } from "../../config/db.js";
import { AppError } from "../../utils/errors.js";
import { slugify } from "../../utils/slug.js";
import { assertIntegerId } from "../../utils/validation.js";

export async function listAssetTypes() {
  const [rows] =
    await pool.execute(`SELECT at.id, at.name, at.slug, at.created_at, at.updated_at,
    (SELECT COUNT(*) FROM assets a WHERE a.asset_type_id = at.id) AS asset_count
    FROM asset_types at ORDER BY at.name ASC`);
  return rows;
}

export async function getAssetType(id) {
  const idN = assertIntegerId(id, "asset type id");
  const [rows] = await pool.execute(
    `SELECT at.id, at.name, at.slug, at.created_at, at.updated_at,
    (SELECT COUNT(*) FROM assets a WHERE a.asset_type_id = at.id) AS asset_count
    FROM asset_types at WHERE at.id = ?`,
    [idN],
  );
  if (!rows.length)
    throw new AppError(404, "ASSET_TYPE_NOT_FOUND", "Asset type not found.");
  return rows[0];
}

export async function createAssetType(name) {
  const slug = slugify(name);
  try {
    const [result] = await pool.execute(
      "INSERT INTO asset_types (name, slug) VALUES (?, ?)",
      [name, slug],
    );
    return getAssetType(result.insertId);
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY")
      throw new AppError(
        409,
        "ASSET_TYPE_EXISTS",
        "An asset type with this name already exists.",
      );
    throw e;
  }
}

export async function updateAssetType(id, name) {
  const idN = assertIntegerId(id, "asset type id");
  const slug = slugify(name);
  try {
    const [result] = await pool.execute(
      "UPDATE asset_types SET name = ?, slug = ? WHERE id = ?",
      [name, slug, idN],
    );
    if (!result.affectedRows)
      throw new AppError(404, "ASSET_TYPE_NOT_FOUND", "Asset type not found.");
    return getAssetType(idN);
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY")
      throw new AppError(
        409,
        "ASSET_TYPE_EXISTS",
        "An asset type with this name already exists.",
      );
    throw e;
  }
}

export async function deleteAssetType(id) {
  const idN = assertIntegerId(id, "asset type id");
  const [[count]] = await Promise.all([
    pool
      .execute("SELECT COUNT(*) AS count FROM assets WHERE asset_type_id = ?", [
        idN,
      ])
      .then(([r]) => [r[0]]),
  ]);
  if (Number(count.count) > 0)
    throw new AppError(
      409,
      "ASSET_TYPE_IN_USE",
      "Cannot delete an asset type that contains assets.",
    );
  const [result] = await pool.execute("DELETE FROM asset_types WHERE id = ?", [
    idN,
  ]);
  if (!result.affectedRows)
    throw new AppError(404, "ASSET_TYPE_NOT_FOUND", "Asset type not found.");
}

export async function getForm(id) {
  const assetTypeId = assertIntegerId(id, "asset type id");
  await getAssetType(assetTypeId);
  const [rows] = await pool.execute(
    `SELECT
    f.id,
    f.name,
    f.\`key\` AS field_key,
    f.type,
    f.dropdown_id,
    f.is_active,
    atf.required,
    atf.show_in_list,
    atf.display_order
  FROM asset_type_fields atf
  JOIN field_definitions f ON f.id = atf.field_definition_id
  WHERE atf.asset_type_id = ?
  ORDER BY atf.display_order ASC, f.id ASC`,
    [assetTypeId],
  );
  return rows.map((r) => ({
    ...r,
    field_key: r.field_key,
    showInList: Boolean(r.show_in_list),
  }));
}

export async function saveForm(assetTypeId, fields) {
  const idN = assertIntegerId(assetTypeId, "asset type id");
  await getAssetType(idN);
  return withTransaction(async (conn) => {
    await conn.execute(
      "DELETE FROM asset_type_fields WHERE asset_type_id = ?",
      [idN],
    );
    for (let i = 0; i < fields.length; i++) {
      const fieldId = assertIntegerId(
        fields[i].fieldDefinitionId,
        "field definition id",
      );
      const [defs] = await conn.execute(
        "SELECT id, is_active, type FROM field_definitions WHERE id = ? LIMIT 1",
        [fieldId],
      );
      if (!defs.length || !defs[0].is_active)
        throw new AppError(
          400,
          "INVALID_FIELD",
          "Selected field definition is unavailable.",
        );
      await conn.execute(
        "INSERT INTO asset_type_fields (asset_type_id, field_definition_id, required, show_in_list, display_order) VALUES (?, ?, ?, ?, ?)",
        [
          idN,
          fieldId,
          Boolean(fields[i].required),
          defs[0].type === "quantity" ? false : Boolean(fields[i].showInList),
          i,
        ],
      );
    }
    return getForm(idN);
  });
}
