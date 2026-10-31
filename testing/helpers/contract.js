import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const BASELINE_FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'baselines',
  'api-contract.json',
);

// Every endpoint the suite treats as read-only. The captured payloads are the
// behaviour contract: after a refactor the same comparison must still pass.
export const READ_ENDPOINTS = [
  '/setup/status',
  '/auth/turnstile-config',
  '/auth/me',
  '/branding',
  '/asset-types',
  '/common-form',
  '/common-form/automations',
  '/common-form/copy-targets',
  '/fields',
  '/dropdowns',
  '/users',
  '/users/capabilities',
  '/email/templates',
  '/email/recipients',
  '/email/rules',
  '/email/history?limit=200',
  '/email/history/all?limit=200',
  '/notifications',
  '/notifications/unread-count',
  '/quick-entry',
  '/settings/smtp',
  '/settings/turnstile',
  '/settings/ip-access',
];

// Structural shape: object keys sorted, arrays collapsed to their element shapes.
export function shape(value) {
  if (Array.isArray(value)) return value.length ? [shape(value[0])] : [];
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = shape(value[key]);
    return out;
  }
  return typeof value;
}

const get = (request, endpoint) => request.get(`/api/v1${endpoint}`);

/**
 * Reads the live contract with an authenticated APIRequestContext: the key names
 * of every read endpoint, each asset type's column layout and rule list, each
 * dropdown's option values, and every field definition. Values that staff edit
 * daily (names, dates, asset data) are deliberately reduced to their type so the
 * comparison survives normal office use.
 */
export async function currentContract(request) {
  const snapshot = { endpoints: {}, types: {} };

  for (const endpoint of READ_ENDPOINTS) {
    const res = await get(request, endpoint);
    const text = await res.text();
    snapshot.endpoints[endpoint] = {
      status: res.status(),
      keys: res.ok() && !text.trim().startsWith('<!doctype') ? shape(JSON.parse(text)) : 'NON_JSON_OR_ERROR',
    };
  }

  const types = (await (await get(request, '/asset-types')).json()).data;
  for (const type of types) {
    const form = (await (await get(request, `/asset-types/${type.id}/assets/form`)).json()).data;
    const automations = (await (await get(request, `/asset-types/${type.id}/automations`)).json()).data;
    snapshot.types[type.id] = {
      name: type.name,
      form: form.fields.map(
        (f) => `${f.order}:${f.key}:${f.type}:${f.required ? 'req' : ''}:${f.showInList ? 'list' : ''}`,
      ),
      automations: form.automations.map(
        (r) => `${r.scope}#${r.id} ${r.sourceKey} ${r.conditionType}${r.conditionValue ? `(${r.conditionValue})` : ''} -> ${r.targetKey} ${r.actionType}${r.actionValue ? `(${r.actionValue})` : ''} [${r.targetType}]`,
      ),
      assetAutomations: automations.map((r) => r.id),
    };
  }

  const dropdowns = (await (await get(request, '/dropdowns')).json()).data;
  for (const dropdown of dropdowns) {
    const detail = (await (await get(request, `/dropdowns/${dropdown.id}`)).json()).data;
    snapshot.types[`dropdown:${dropdown.id}`] = {
      name: dropdown.name,
      options: detail.options.map((o) => `${o.value}${o.is_active ? '' : '(inactive)'}`),
    };
  }

  const fields = (await (await get(request, '/fields')).json()).data;
  snapshot.fieldDefinitions = fields.map(
    (f) => `${f.id}:${f.key}:${f.type}:${f.is_active ? 'active' : 'inactive'}`,
  );

  return snapshot;
}

export function readBaseline() {
  if (!fs.existsSync(BASELINE_FILE)) {
    throw new Error(
      `${BASELINE_FILE} is missing - capture it with: node helpers/capture-snapshot.js`,
    );
  }
  return JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'));
}
