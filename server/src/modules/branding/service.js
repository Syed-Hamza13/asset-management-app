import { pool } from "../../config/db.js";
import { AppError } from "../../utils/errors.js";

const keys = new Set(["favicon_data_url", "app_icon_data_url"]);

// Mirrors the upload rule in updateBranding(): only these image types may be
// decoded back to bytes for the public favicon route.
const ICON_DATA_URL =
  /^data:(image\/(?:png|jpeg|gif|webp|svg\+xml));base64,([A-Za-z0-9+/=]+)$/;

export function decodeIconDataUrl(value) {
  const match = ICON_DATA_URL.exec(value || "");
  if (!match) return null;
  return { mime: match[1], buffer: Buffer.from(match[2], "base64") };
}

export async function getBranding() {
  const [rows] = await pool.execute(
    "SELECT setting_key, setting_value FROM app_settings WHERE setting_key IN ('favicon_data_url', 'app_icon_data_url')",
  );
  const values = Object.fromEntries(
    rows.map((row) => [row.setting_key, row.setting_value || ""]),
  );
  return {
    favicon: values.favicon_data_url || "",
    appIcon: values.app_icon_data_url || "",
  };
}

export async function updateBranding(key, value) {
  if (!keys.has(key))
    throw new AppError(
      400,
      "INVALID_BRANDING_KEY",
      "Unsupported branding setting.",
    );
  if (typeof value !== "string" || value.length > 4_000_000)
    throw new AppError(
      400,
      "INVALID_BRANDING_IMAGE",
      "Branding image is too large.",
    );
  if (
    !/^data:image\/(png|jpeg|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(
      value,
    )
  )
    throw new AppError(
      400,
      "INVALID_BRANDING_IMAGE",
      "Branding image must be a supported image.",
    );
  await pool.execute(
    "UPDATE app_settings SET setting_value = ? WHERE setting_key = ?",
    [value, key],
  );
  return getBranding();
}
