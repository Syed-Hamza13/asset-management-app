import { pool, withTransaction } from "../../config/db.js";
import { AppError } from "../../utils/errors.js";
import { slugify } from "../../utils/slug.js";
import { assertIntegerId } from "../../utils/validation.js";
import { inPlaceholders } from "../../utils/sql.js";
import { accessibleTypesSql } from "../../utils/scope.js";
import { attachCommonFields } from "../commonForms/service.js";

export async function listAssetTypes(actor) {
  const scope = accessibleTypesSql(actor, "at");
  const [rows] =
    await pool.execute(`SELECT at.id, at.name, at.slug, at.created_at, at.updated_at,
    (at.owner_user_id = ?) AS is_owner,
    (SELECT COUNT(*) FROM assets a WHERE a.asset_type_id = at.id) AS asset_count
    FROM asset_types at WHERE 1=1${scope.sql} ORDER BY at.name ASC`, [actor.id, ...scope.params]);
  return rows.map((r) => ({ ...r, is_owner: Boolean(r.is_owner) }));
}

export async function getAssetType(actor, id) {
  const idN = assertIntegerId(id, "asset type id");
  const scope = accessibleTypesSql(actor, "at");
  const [rows] = await pool.execute(
    `SELECT at.id, at.name, at.slug, at.owner_user_id, at.created_at, at.updated_at,
    (at.owner_user_id = ?) AS is_owner,
    (SELECT COUNT(*) FROM assets a WHERE a.asset_type_id = at.id) AS asset_count
    FROM asset_types at WHERE at.id = ?${scope.sql}`,
    [actor.id, idN, ...scope.params],
  );
  if (!rows.length)
    throw new AppError(404, "ASSET_TYPE_NOT_FOUND", "Asset type not found.");
  const row = rows[0];
  return { ...row, is_owner: Boolean(row.is_owner) };
}

// Structural edits (rename, delete, form layout) stay with the type owner and admins.
// Access (view + use) may additionally come from an admin share, so this is
// deliberately stricter than the accessible scope used for reads.
export async function assertTypeOwnership(actor, id) {
  const idN = assertIntegerId(id, "asset type id");
  const [rows] = await pool.execute(
    "SELECT id, owner_user_id, name, slug FROM asset_types WHERE id = ? LIMIT 1",
    [idN],
  );
  if (!rows.length)
    throw new AppError(404, "ASSET_TYPE_NOT_FOUND", "Asset type not found.");
  if (!actor.isAdmin && Number(rows[0].owner_user_id) !== Number(actor.id))
    throw new AppError(
      403,
      "ASSET_TYPE_NOT_OWNED",
      "Only the asset type owner or an admin can change its structure.",
    );
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
  await assertTypeOwnership(actor, idN);
  const slug = slugify(name);
  try {
    await pool.execute(
      "UPDATE asset_types SET name = ?, slug = ? WHERE id = ?",
      [name, slug, idN],
    );
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
  await assertTypeOwnership(actor, idN);
  const [[count]] = await pool.execute(
    "SELECT COUNT(*) AS count FROM assets WHERE asset_type_id = ?",
    [idN],
  );
  if (Number(count.count) > 0)
    throw new AppError(
      409,
      "ASSET_TYPE_IN_USE",
      "Cannot delete an asset type that contains assets.",
    );
  await pool.execute("DELETE FROM asset_types WHERE id = ?", [idN]);
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
  const type = await assertTypeOwnership(actor, idN);
  return withTransaction(async (conn) => {
    await conn.execute(
      "DELETE FROM asset_type_fields WHERE asset_type_id = ?",
      [idN],
    );
    // Field definitions must belong to the type owner (admins are unrestricted),
    // so a shared type's form can never be pointed at another user's fields.
    const fieldScope = actor.isAdmin
      ? { sql: "", params: [] }
      : { sql: " AND owner_user_id = ?", params: [type.owner_user_id] };
    for (let i = 0; i < fields.length; i++) {
      const fieldId = assertIntegerId(
        fields[i].fieldDefinitionId,
        "field definition id",
      );
      const [defs] = await conn.execute(
        `SELECT id, is_active, type FROM field_definitions WHERE id = ?${fieldScope.sql} LIMIT 1`,
        [fieldId, ...fieldScope.params],
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

// --- Sharing (admin-managed) ---

export async function getShares(actor, id) {
  const idN = assertIntegerId(id, "asset type id");
  await getAssetType(actor, idN);
  const [rows] = await pool.execute(
    `SELECT s.user_id, s.created_at, u.email, u.role
     FROM asset_type_shares s JOIN users u ON u.id = s.user_id
     WHERE s.asset_type_id = ? ORDER BY u.email ASC`,
    [idN],
  );
  return rows;
}

export async function setShares(actor, id, userIds) {
  const idN = assertIntegerId(id, "asset type id");
  await getAssetType(actor, idN);
  const uniqueIds = [
    ...new Set(
      (Array.isArray(userIds) ? userIds : [])
        .map((x) => assertIntegerId(x, "user id"))
        .filter((x) => Number(x) !== Number(actor.id)),
    ),
  ];
  if (uniqueIds.length) {
    const [existing] = await pool.query(
      `SELECT id FROM users WHERE id IN (${inPlaceholders(uniqueIds)})`,
      uniqueIds,
    );
    const found = new Set(existing.map((u) => Number(u.id)));
    const missing = uniqueIds.filter((x) => !found.has(Number(x)));
    if (missing.length)
      throw new AppError(
        400,
        "USER_NOT_FOUND",
        `One or more selected users do not exist: ${missing.join(", ")}`,
      );
  }
  await withTransaction(async (conn) => {
    await conn.execute(
      "DELETE FROM asset_type_shares WHERE asset_type_id = ?",
      [idN],
    );
    for (const userId of uniqueIds) {
      await conn.execute(
        "INSERT IGNORE INTO asset_type_shares (asset_type_id, user_id, created_by) VALUES (?, ?, ?)",
        [idN, userId, actor.id],
      );
    }
  });
  return getShares(actor, idN);
}
