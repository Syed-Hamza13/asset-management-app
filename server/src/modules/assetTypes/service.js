import { pool, withTransaction } from "../../config/db.js";
import { AppError } from "../../utils/errors.js";
import { slugify } from "../../utils/slug.js";
import { assertIntegerId } from "../../utils/validation.js";
import { ownerScope } from "../../utils/scope.js";
import { attachCommonFields } from "../commonForms/service.js";

export async function listAssetTypes(actor) {
  const scope = ownerScope(actor, "at.owner_user_id");
  const [rows] =
    await pool.execute(`SELECT at.id, at.name, at.slug, at.created_at, at.updated_at,
    (SELECT COUNT(*) FROM assets a WHERE a.asset_type_id = at.id) AS asset_count
    FROM asset_types at WHERE 1=1${scope.sql} ORDER BY at.name ASC`, scope.params);
  return rows;
}

export async function getAssetType(actor, id) {
  const idN = assertIntegerId(id, "asset type id");
  const scope = ownerScope(actor, "at.owner_user_id");
  const [rows] = await pool.execute(
    `SELECT at.id, at.name, at.slug, at.created_at, at.updated_at,
    (SELECT COUNT(*) FROM assets a WHERE a.asset_type_id = at.id) AS asset_count
    FROM asset_types at WHERE at.id = ?${scope.sql}`,
    [idN, ...scope.params],
  );
  if (!rows.length)
    throw new AppError(404, "ASSET_TYPE_NOT_FOUND", "Asset type not found.");
  return rows[0];
}

export async function createAssetType(actor, name) {
  const slug = slugify(name);
  let newId;
  try {
    await withTransaction(async (conn) => {
      const [result] = await conn.execute(
        "INSERT INTO asset_types (name, slug, owner_user_id) VALUES (?, ?, ?)",
        [name, slug, actor.id],
      );
      newId = result.insertId;
      await attachCommonFields(actor, newId, conn);
    });
    return getAssetType(actor, newId);
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

export async function updateAssetType(actor, id, name) {
  const idN = assertIntegerId(id, "asset type id");
  const slug = slugify(name);
  const scope = ownerScope(actor);
  try {
    const [result] = await pool.execute(
      `UPDATE asset_types SET name = ?, slug = ? WHERE id = ?${scope.sql}`,
      [name, slug, idN, ...scope.params],
    );
    if (!result.affectedRows)
      throw new AppError(404, "ASSET_TYPE_NOT_FOUND", "Asset type not found.");
    return getAssetType(actor, idN);
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

export async function deleteAssetType(actor, id) {
  const idN = assertIntegerId(id, "asset type id");
  const scope = ownerScope(actor);
  const [[count]] = await pool
    .execute(
      `SELECT COUNT(*) AS count FROM assets WHERE asset_type_id = ?${scope.sql}`,
      [idN, ...scope.params],
    )
    .then(([r]) => [r[0]]);
  if (Number(count.count) > 0)
    throw new AppError(
      409,
      "ASSET_TYPE_IN_USE",
      "Cannot delete an asset type that contains assets.",
    );
  const [result] = await pool.execute(
    `DELETE FROM asset_types WHERE id = ?${scope.sql}`,
    [idN, ...scope.params],
  );
  if (!result.affectedRows)
    throw new AppError(404, "ASSET_TYPE_NOT_FOUND", "Asset type not found.");
}

export async function getForm(actor, id) {
  const assetTypeId = assertIntegerId(id, "asset type id");
  await getAssetType(actor, assetTypeId);
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

export async function saveForm(actor, assetTypeId, fields) {
  const idN = assertIntegerId(assetTypeId, "asset type id");
  await getAssetType(actor, idN);
  return withTransaction(async (conn) => {
    await conn.execute(
      "DELETE FROM asset_type_fields WHERE asset_type_id = ?",
      [idN],
    );
    const scope = ownerScope(actor);
    for (let i = 0; i < fields.length; i++) {
      const fieldId = assertIntegerId(
        fields[i].fieldDefinitionId,
        "field definition id",
      );
      const [defs] = await conn.execute(
        `SELECT id, is_active, type FROM field_definitions WHERE id = ?${scope.sql} LIMIT 1`,
        [fieldId, ...scope.params],
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
    return getForm(actor, idN);
  });
}
