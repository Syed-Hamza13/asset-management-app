import { AppError } from '../../utils/errors.js';

const FIXED = new Set(['asset_type_name', 'asset_public_id', 'created_at', 'updated_at', 'user.email', 'user.name']);
const FIELD_RE = /^field\.[A-Za-z0-9_]+(\.previous)?$/;
const TOKEN_RE = /\{\{\s*([^}]+?)\s*\}\}/g;

export function isValidToken(token) {
  return FIXED.has(token) || FIELD_RE.test(token);
}

// Reject unknown placeholders at template-save time with a clear error.
export function validatePlaceholders(...texts) {
  const bad = new Set();
  for (const text of texts) {
    if (typeof text !== 'string') continue;
    for (const match of text.matchAll(TOKEN_RE)) {
      const token = match[1].trim();
      if (!isValidToken(token)) bad.add(token);
    }
  }
  if (bad.size) {
    throw new AppError(400, 'UNKNOWN_PLACEHOLDER', `Unknown placeholder(s): ${[...bad].map((b) => `{{${b}}}`).join(', ')}`);
  }
}

function lookup(token, payload) {
  if (token === 'asset_type_name') return payload.assetTypeName ?? '';
  if (token === 'asset_public_id') return payload.publicId ?? '';
  if (token === 'created_at') return payload.createdAt ?? '';
  if (token === 'updated_at') return payload.updatedAt ?? '';
  if (token === 'user.email') return payload.user?.email ?? '';
  if (token === 'user.name') return payload.user?.name ?? '';
  if (token.startsWith('field.')) {
    const parts = token.slice('field.'.length).split('.');
    const key = parts[0];
    const isPrev = parts[1] === 'previous';
    const source = isPrev ? payload.previous : payload.fields;
    const value = source?.[key];
    return value === undefined || value === null ? '' : String(value);
  }
  return '';
}

// Plain-text rendering: values are inserted verbatim (no HTML).
export function renderTemplate(text, payload) {
  if (typeof text !== 'string') return '';
  return text.replace(TOKEN_RE, (_m, raw) => lookup(raw.trim(), payload));
}

export const PLACEHOLDER_HELP = [
  '{{asset_type_name}}', '{{asset_public_id}}', '{{created_at}}', '{{updated_at}}',
  '{{user.email}}', '{{user.name}}', '{{field.<key>}}', '{{field.<key>.previous}}',
];
