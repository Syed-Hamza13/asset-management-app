import { pool, withTransaction } from "../../config/db.js";
import { v4 as uuidv4 } from "uuid";
import { AppError } from "../../utils/errors.js";
import { assertIntegerId, validateFieldValue } from "../../utils/validation.js";
import { accessibleTypesSql, assetAccessSql } from "../../utils/scope.js";
import { applyAutomations, getEffectiveAutomations } from "./automation.js";
import { indiaToday } from "../../utils/dateTime.js";
import { attachCommonFields } from "../commonForms/service.js";
import { applyCommonAutomations } from "../commonForms/automationService.js";
import { enqueueForCreate, enqueueForUpdate } from "../email/enqueue.js";

// Resolve the actor whose common form, automations and email rules should drive a
// write on `assetTypeId`. Normally this is the acting user; when someone adds to a
// type owned by another user (shared with them by an admin) the type's own
// structure, common fields and rules belong to the owner, so we substitute a
// lightweight owner actor. Admins keep acting as themselves (already global scope).
async function resolveActorForType(actor, assetTypeId) {
  if (actor.isAdmin) return actor;
  const [rows] = await pool.execute(
    `SELECT at.owner_user_id, u.email AS owner_email
     FROM asset_types at JOIN users u ON u.id = at.owner_user_id
     WHERE at.id = ? LIMIT 1`,
    [assetTypeId],
  );
  if (!rows.length) return actor;
  if (Number(rows[0].owner_user_id) === Number(actor.id)) return actor;
  return {
    id: rows[0].owner_user_id,
    email: rows[0].owner_email,
    role: "user",
    isAdmin: false,
    permissions: [],
  };
}


export async function getAssetForm(actor, assetTypeId) {
  const id = assertIntegerId(assetTypeId, "asset type id");
  const [rows] = await pool.execute(
    `SELECT
  atf.required,
  atf.show_in_list,
  f.id,
  f.name,
  f.\`key\` AS field_key,
  f.type,
  f.dropdown_id,
  atf.display_order
FROM asset_type_fields atf
JOIN field_definitions f ON f.id = atf.field_definition_id
WHERE atf.asset_type_id = ? AND f.is_active = 1
ORDER BY atf.display_order, f.id`,
    [id],
  );
  const fields = rows.map(r => ({
  id: r.id,
  name: r.name,
  key: r.field_key,
  type: r.type,
  dropdownId: r.dropdown_id,
  required: Boolean(r.required),
  showInList: Boolean(r.show_in_list),
  order: r.display_order
}));
  // A sharee must see the same automations the server will actually apply on create,
  // which are the type OWNER's (common form + asset rules), not the acting user's.
  // Substituting the owner actor here keeps the client preview aligned with createAsset.
  const ownerActor = await resolveActorForType(actor, id);
  const automations = await getEffectiveAutomations(ownerActor, id);
  // Defensive: never hand the client a rule whose source/target key is not a field on
  // this type, otherwise DynamicForm injects an unknown key into values and the server
  // rejects the write with "Unknown field".
  const keys = new Set(fields.map((f) => f.key));
  return {
    fields,
    automations: automations.filter(
      (r) => keys.has(r.sourceKey) && keys.has(r.targetKey),
    ),
  };
}

export async function validateValues(actor, assetTypeId, values, existingValues = {}) {
  if (!values || typeof values !== "object" || Array.isArray(values))
    throw new AppError(
      400,
      "INVALID_VALUES",
      "Asset values must be an object.",
    );
  const { fields } = await getAssetForm(actor, assetTypeId);
  const allowed = new Set(fields.map((f) => f.key));
  for (const key of Object.keys(values))
    if (!allowed.has(key))
      throw new AppError(400, "UNKNOWN_FIELD", `Unknown field: ${key}`);
  const result = {};
  for (const field of fields) {
    const has = Object.prototype.hasOwnProperty.call(values, field.key);

    if (!has) {
      const existingValue = existingValues[field.key];
      if (
        field.required &&
        (!Object.prototype.hasOwnProperty.call(existingValues, field.key) ||
          existingValue === null || existingValue === undefined || existingValue === "")
      ) {
        throw new AppError(400, "REQUIRED_FIELD", `${field.name} is required.`);
      }

      if (Object.prototype.hasOwnProperty.call(existingValues, field.key)) {
        result[field.key] = existingValue;
      }

      continue;
    }

    if (values[field.key] === "") {
      if (field.required) {
        throw new AppError(400, "REQUIRED_FIELD", `${field.name} is required.`);
      }

      // Explicitly cleared by the user.
      // Do NOT restore the old value.
      result[field.key] = "";
      continue;
    }
    let optionValues = new Set();
    if (field.type === "dropdown") {
      const [options] = await pool.execute(
        "SELECT value FROM dropdown_options WHERE dropdown_id = ? AND is_active = 1",
        [field.dropdownId],
      );
      optionValues = new Set(options.map((o) => o.value));
      if (
        existingValues[field.key] !== undefined &&
        values[field.key] === existingValues[field.key]
      )
        optionValues.add(values[field.key]);
    }
    validateFieldValue(
      { ...field, name: field.name },
      values[field.key],
      optionValues,
    );
    result[field.key] = values[field.key];
  }
  return result;
}

export async function listAssets(actor, assetTypeId, page = 1, pageSize = 20) {
  const id = assertIntegerId(assetTypeId, "asset type id");
  const scope = assetAccessSql(actor, "a");
  const limit = Math.min(Math.max(Number(pageSize) || 20, 1), 100);
  const currentPage = Math.max(Number(page) || 1, 1);
  const offset = (currentPage - 1) * limit;
  const [[count]] = await pool.execute(
    `SELECT COUNT(*) AS count FROM assets a WHERE a.asset_type_id = ?${scope.sql}`,
    [id, ...scope.params],
  );
  const [rows] = await pool.execute(
    `SELECT public_id, values_json, created_at, updated_at FROM assets a WHERE a.asset_type_id = ?${scope.sql} ORDER BY a.created_at DESC LIMIT ${limit} OFFSET ${offset}`,
    [id, ...scope.params],
  );
  return {
    items: rows.map((r) => ({
      publicId: r.public_id,
      values:
        typeof r.values_json === "string"
          ? JSON.parse(r.values_json)
          : r.values_json,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
    page: currentPage,
    pageSize: limit,
    total: Number(count.count),
  };
}

export async function createAsset(actor, assetTypeId, values) {
  const id = assertIntegerId(assetTypeId, "asset type id");
  const typeScope = accessibleTypesSql(actor, "at");
  const [typeRows] = await pool.execute(
    `SELECT at.id, at.name FROM asset_types at WHERE at.id = ?${typeScope.sql}`,
    [id, ...typeScope.params],
  );
  if (!typeRows.length)
    throw new AppError(404, "ASSET_TYPE_NOT_FOUND", "Asset type not found.");
  const assetTypeName = typeRows[0].name;
  // The type's common fields, automations and email rules belong to its owner;
  // when a sharee adds to the type we run those steps as the owner so their
  // private common form is never injected into the shared structure.
  const ownerActor = await resolveActorForType(actor, id);
  await withTransaction(async (conn) => {
    await attachCommonFields(ownerActor, id, conn);
  });
  const form = await getAssetForm(actor, id);
  const fields = form.fields;
  const prepared = { ...values };
  const quantityField = fields.find((field) => field.type === "quantity");
  const quantity = quantityField ? Number(prepared[quantityField.key] ?? 1) : 1;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 15)
    throw new AppError(400, "INVALID_QUANTITY", "Quantity must be a whole number between 1 and 15.");
  if (quantityField) prepared[quantityField.key] = quantity;
  for (const field of fields) {
    if (
      field.type === "auto_date" &&
      (prepared[field.key] === undefined ||
        prepared[field.key] === null ||
        prepared[field.key] === "")
    ) {
      prepared[field.key] = indiaToday();
    }
  }
  const automated = await applyAutomations(ownerActor, id, await applyCommonAutomations(ownerActor, prepared));
  const validated = await validateValues(actor, id, automated);
  if (quantityField) delete validated[quantityField.key];
  const publicIds = [];
  let notificationsQueued = 0;
  const nowIso = new Date().toISOString();
  await withTransaction(async (conn) => {
    for (let index = 0; index < quantity; index += 1) {
      const publicId = uuidv4();
      await conn.execute(
        "INSERT INTO assets (public_id, asset_type_id, values_json, owner_user_id) VALUES (?, ?, ?, ?)",
        [publicId, id, JSON.stringify(validated), actor.id],
      );
      publicIds.push(publicId);
      notificationsQueued += await enqueueForCreate(
        conn,
        ownerActor,
        { publicId, assetTypeId: id, assetTypeName, createdAt: nowIso, updatedAt: nowIso },
        validated,
        actor,
      );
    }
  });
  const created = await getAsset(actor, publicIds[0]);
  return { ...created, notificationsQueued };
}

export async function getAsset(actor, publicId) {
  const scope = assetAccessSql(actor, "a");
  const [rows] = await pool.execute(
    `SELECT a.public_id, a.asset_type_id, a.values_json, a.created_at, a.updated_at, at.name AS asset_type_name FROM assets a JOIN asset_types at ON at.id=a.asset_type_id WHERE a.public_id = ?${scope.sql}`,
    [publicId, ...scope.params],
  );
  if (!rows.length)
    throw new AppError(404, "ASSET_NOT_FOUND", "Asset not found.");
  const r = rows[0];
  return {
    publicId: r.public_id,
    assetTypeId: r.asset_type_id,
    assetTypeName: r.asset_type_name,
    values:
      typeof r.values_json === "string"
        ? JSON.parse(r.values_json)
        : r.values_json,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function updateAsset(actor, publicId, values) {
  const current = await getAsset(actor, publicId);
  const { fields: form } = await getAssetForm(actor, current.assetTypeId);
  const currentValues = current.values || {};
  const allowedKeys = new Set(form.map((field) => field.key));
  const incoming = Object.fromEntries(
    Object.entries({ ...currentValues, ...values }).filter(([key]) => allowedKeys.has(key)),
  );
  const quantityField = form.find((field) => field.type === "quantity");
  if (quantityField) incoming[quantityField.key] = 1;
  const ownerActor = await resolveActorForType(actor, current.assetTypeId);
  const automated = await applyAutomations(
    ownerActor,
    current.assetTypeId,
    await applyCommonAutomations(ownerActor, incoming, current.values),
    current.values,
  );
  const merged = await validateValues(
    actor,
    current.assetTypeId,
    automated,
    current.values,
  );
  const legacyValues = Object.fromEntries(
    Object.entries(currentValues).filter(([key]) => !allowedKeys.has(key)),
  );
  if (quantityField) delete merged[quantityField.key];
  const storedValues = { ...legacyValues, ...merged };
  const scope = assetAccessSql(actor);
  let notificationsQueued = 0;
  const nowIso = new Date().toISOString();
  await withTransaction(async (conn) => {
    const [result] = await conn.execute(
      `UPDATE assets SET values_json = ? WHERE public_id = ?${scope.sql}`,
      [JSON.stringify(storedValues), publicId, ...scope.params],
    );
    if (!result.affectedRows) throw new AppError(404, "ASSET_NOT_FOUND", "Asset not found.");
    notificationsQueued = await enqueueForUpdate(
      conn,
      ownerActor,
      { publicId, assetTypeId: current.assetTypeId, assetTypeName: current.assetTypeName, createdAt: current.createdAt, updatedAt: nowIso },
      current.values || {},
      storedValues,
      actor,
    );
  });
  const updated = await getAsset(actor, publicId);
  return { ...updated, notificationsQueued };
}

export async function deleteAsset(actor, publicId) {
  const scope = assetAccessSql(actor);
  const [r] = await pool.execute(
    `DELETE FROM assets WHERE public_id = ?${scope.sql}`,
    [publicId, ...scope.params],
  );
  if (!r.affectedRows)
    throw new AppError(404, "ASSET_NOT_FOUND", "Asset not found.");
}

export async function bulkUpdateAssets(actor, assetTypeId, publicIds, values) {
  const id = assertIntegerId(assetTypeId, "asset type id");
  if (!Array.isArray(publicIds) || publicIds.length === 0) throw new AppError(400, "ASSETS_REQUIRED", "Select at least one asset.");
  const scope = assetAccessSql(actor);
  const [rows] = await pool.execute(
    `SELECT public_id FROM assets WHERE asset_type_id = ?${scope.sql} AND public_id IN (${publicIds.map(() => "?").join(",")})`,
    [id, ...scope.params, ...publicIds],
  );
  if (rows.length !== publicIds.length) throw new AppError(400, "INVALID_ASSETS", "Selected assets must belong to this asset type.");
  let notificationsQueued = 0;
  for (const publicId of publicIds) {
    const result = await updateAsset(actor, publicId, values);
    notificationsQueued += result.notificationsQueued || 0;
  }
  return { updated: publicIds.length, notificationsQueued };
}

export async function bulkDeleteAssets(actor, assetTypeId, publicIds) {
  const id = assertIntegerId(assetTypeId, "asset type id");
  if (!Array.isArray(publicIds) || publicIds.length === 0) throw new AppError(400, "ASSETS_REQUIRED", "Select at least one asset.");
  const scope = assetAccessSql(actor);
  return withTransaction(async (conn) => {
    const [result] = await conn.execute(
      `DELETE FROM assets WHERE asset_type_id = ?${scope.sql} AND public_id IN (${publicIds.map(() => "?").join(",")})`,
      [id, ...scope.params, ...publicIds],
    );
    if (result.affectedRows !== publicIds.length) throw new AppError(400, "INVALID_ASSETS", "Selected assets must belong to this asset type.");
    return { deleted: result.affectedRows };
  });
}
