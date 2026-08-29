import { pool, withTransaction } from "../../config/db.js";
import { v4 as uuidv4 } from "uuid";
import { AppError } from "../../utils/errors.js";
import { assertIntegerId, validateFieldValue } from "../../utils/validation.js";
import { applyAutomations } from "./automation.js";
import { indiaToday } from "../../utils/dateTime.js";
import { attachCommonFields } from "../commonForms/service.js";
import { applyCommonAutomations } from "../commonForms/automationService.js";

export async function getAssetForm(assetTypeId) {
  const id = assertIntegerId(assetTypeId, "asset type id");
  await attachCommonFields(id);
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
  return rows.map(r => ({
  id: r.id,
  name: r.name,
  key: r.field_key,
  type: r.type,
  dropdownId: r.dropdown_id,
  required: Boolean(r.required),
  showInList: Boolean(r.show_in_list),
  order: r.display_order
}));
}

export async function validateValues(assetTypeId, values, existingValues = {}) {
  if (!values || typeof values !== "object" || Array.isArray(values))
    throw new AppError(
      400,
      "INVALID_VALUES",
      "Asset values must be an object.",
    );
  const fields = await getAssetForm(assetTypeId);
  const allowed = new Set(fields.map((f) => f.key));
  for (const key of Object.keys(values))
    if (!allowed.has(key))
      throw new AppError(400, "UNKNOWN_FIELD", `Unknown field: ${key}`);
  const result = {};
  for (const field of fields) {
    const has = Object.prototype.hasOwnProperty.call(values, field.key);

    if (!has) {
      if (
        field.required &&
        !Object.prototype.hasOwnProperty.call(existingValues, field.key)
      ) {
        throw new AppError(400, "REQUIRED_FIELD", `${field.name} is required.`);
      }

      if (Object.prototype.hasOwnProperty.call(existingValues, field.key)) {
        result[field.key] = existingValues[field.key];
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

export async function listAssets(assetTypeId, page = 1, pageSize = 20) {
  const id = assertIntegerId(assetTypeId, "asset type id");
  const limit = Math.min(Math.max(Number(pageSize) || 20, 1), 100);
  const currentPage = Math.max(Number(page) || 1, 1);
  const offset = (currentPage - 1) * limit;
  const [[count]] = await pool.execute(
    "SELECT COUNT(*) AS count FROM assets WHERE asset_type_id = ?",
    [id],
  );
  const [rows] = await pool.execute(
    `SELECT public_id, values_json, created_at, updated_at FROM assets WHERE asset_type_id = ? ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`,
    [id],
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

export async function createAsset(assetTypeId, values) {
  const id = assertIntegerId(assetTypeId, "asset type id");
  await withTransaction(async (conn) => {
    await attachCommonFields(id, conn);
  });
  const form = await getAssetForm(id);
  const prepared = { ...values };
  const quantityField = form.find((field) => field.type === "quantity");
  const quantity = quantityField ? Number(prepared[quantityField.key] ?? 1) : 1;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 15)
    throw new AppError(400, "INVALID_QUANTITY", "Quantity must be a whole number between 1 and 15.");
  if (quantityField) prepared[quantityField.key] = quantity;
  for (const field of form) {
    if (
      field.type === "auto_date" &&
      (prepared[field.key] === undefined ||
        prepared[field.key] === null ||
        prepared[field.key] === "")
    ) {
      prepared[field.key] = indiaToday();
    }
  }
  const automated = await applyAutomations(id, await applyCommonAutomations(prepared));
  const validated = await validateValues(id, automated);
  if (quantityField) delete validated[quantityField.key];
  const publicIds = [];
  await withTransaction(async (conn) => {
    for (let index = 0; index < quantity; index += 1) {
      const publicId = uuidv4();
      await conn.execute(
        "INSERT INTO assets (public_id, asset_type_id, values_json) VALUES (?, ?, ?)",
        [publicId, id, JSON.stringify(validated)],
      );
      publicIds.push(publicId);
    }
  });
  return getAsset(publicIds[0]);
}

export async function getAsset(publicId) {
  const [rows] = await pool.execute(
    "SELECT a.public_id, a.asset_type_id, a.values_json, a.created_at, a.updated_at, at.name AS asset_type_name FROM assets a JOIN asset_types at ON at.id=a.asset_type_id WHERE a.public_id = ?",
    [publicId],
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

export async function updateAsset(publicId, values) {
  const current = await getAsset(publicId);
  const incoming = { ...current.values, ...values };
  const form = await getAssetForm(current.assetTypeId);
  const quantityField = form.find((field) => field.type === "quantity");
  if (quantityField) incoming[quantityField.key] = 1;
  const automated = await applyAutomations(
    current.assetTypeId,
    await applyCommonAutomations(incoming, current.values),
    current.values,
  );
  const merged = await validateValues(
    current.assetTypeId,
    automated,
    current.values,
  );
  if (quantityField) delete merged[quantityField.key];
  await pool.execute("UPDATE assets SET values_json = ? WHERE public_id = ?", [
    JSON.stringify(merged),
    publicId,
  ]);
  return getAsset(publicId);
}

export async function deleteAsset(publicId) {
  const [r] = await pool.execute("DELETE FROM assets WHERE public_id = ?", [
    publicId,
  ]);
  if (!r.affectedRows)
    throw new AppError(404, "ASSET_NOT_FOUND", "Asset not found.");
}

export async function bulkUpdateAssets(assetTypeId, publicIds, values) {
  const id = assertIntegerId(assetTypeId, "asset type id");
  if (!Array.isArray(publicIds) || publicIds.length === 0) throw new AppError(400, "ASSETS_REQUIRED", "Select at least one asset.");
  const [rows] = await pool.execute(
    `SELECT public_id FROM assets WHERE asset_type_id = ? AND public_id IN (${publicIds.map(() => "?").join(",")})`,
    [id, ...publicIds],
  );
  if (rows.length !== publicIds.length) throw new AppError(400, "INVALID_ASSETS", "Selected assets must belong to this asset type.");
  for (const publicId of publicIds) await updateAsset(publicId, values);
  return { updated: publicIds.length };
}

export async function bulkDeleteAssets(assetTypeId, publicIds) {
  const id = assertIntegerId(assetTypeId, "asset type id");
  if (!Array.isArray(publicIds) || publicIds.length === 0) throw new AppError(400, "ASSETS_REQUIRED", "Select at least one asset.");
  return withTransaction(async (conn) => {
    const [result] = await conn.execute(
      `DELETE FROM assets WHERE asset_type_id = ? AND public_id IN (${publicIds.map(() => "?").join(",")})`,
      [id, ...publicIds],
    );
    if (result.affectedRows !== publicIds.length) throw new AppError(400, "INVALID_ASSETS", "Selected assets must belong to this asset type.");
    return { deleted: result.affectedRows };
  });
}
