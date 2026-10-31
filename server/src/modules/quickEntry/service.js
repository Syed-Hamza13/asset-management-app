import { z } from 'zod';
import { pool, withTransaction } from '../../config/db.js';
import { AppError } from '../../utils/errors.js';
import { verifyTurnstile } from '../setup/turnstile.js';

// The login-screen form renders exactly the fields the admin configures —
// nothing is built in.
const MAX_FIELDS = 15;
const TEXT_MAX = 200;
const MULTILINE_MAX = 2000;

// Shown on the login screen until an admin overrides them in Settings.
export const DEFAULT_FORM_TITLE = 'Quick Entry';
export const DEFAULT_FORM_SUBTITLE = 'Submit a request without signing in.';

// Replaces {Field Label} tokens with that field's submitted value; {all} expands to
// one "Label: value" line per filled field. Unknown tokens are left as written.
function renderTemplate(template, snapshotFields) {
  const byLabel = new Map(snapshotFields.map((f) => [f.label.trim().toLowerCase(), f.value]));
  const filled = snapshotFields.filter((f) => f.value);
  return String(template).replace(/\{([^{}]+)\}/g, (match, key) => {
    const token = key.trim().toLowerCase();
    if (token === 'all') return filled.map((f) => `${f.label}: ${f.value}`).join('\n');
    const value = byLabel.get(token);
    return value === undefined ? match : value;
  });
}

// Strip ASCII control chars except newline/tab (defense-in-depth on untrusted input).
function cleanText(value) {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim();
}

const SETTINGS_COLUMNS =
  'enabled, notify_picker, form_title, form_subtitle, notify_title, notify_body';

async function getSettingsRow(conn = pool) {
  const [rows] = await conn.execute(
    `SELECT ${SETTINGS_COLUMNS} FROM quick_entry_settings WHERE id = 1 LIMIT 1`,
  );
  if (rows.length) return rows[0];
  await conn.execute('INSERT IGNORE INTO quick_entry_settings (id, enabled, notify_picker) VALUES (1, 0, 0)');
  return { enabled: 0, notify_picker: 0, form_title: null, form_subtitle: null, notify_title: null, notify_body: null };
}

async function listFields(conn = pool) {
  const [rows] = await conn.execute(
    'SELECT id, label, type, placeholder, required, display_order FROM quick_entry_fields ORDER BY display_order ASC, id ASC',
  );
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    type: r.type,
    placeholder: r.placeholder || '',
    required: Boolean(r.required),
  }));
}

async function listRecipientIds(conn = pool) {
  const [rows] = await conn.execute('SELECT user_id FROM quick_entry_recipients ORDER BY user_id ASC');
  return rows.map((r) => Number(r.user_id));
}

// Selectable recipients for the login-screen picker. Exposed as a friendly name
// (display name, falling back to the email's local part) so full addresses are
// never shown to a visitor.
async function listSelectableRecipients(conn = pool) {
  const [rows] = await conn.execute(
    `SELECT u.id, COALESCE(NULLIF(TRIM(u.display_name), ''), SUBSTRING_INDEX(u.email, '@', 1)) AS label
     FROM quick_entry_recipients qer JOIN users u ON u.id = qer.user_id
     WHERE u.is_active = 1 ORDER BY label ASC`,
  );
  return rows.map((r) => ({ id: Number(r.id), label: String(r.label) }));
}

// Public shape returned to the (unauthenticated) login screen.
export async function getPublicConfig() {
  const settings = await getSettingsRow();
  if (!Number(settings.enabled))
    return { enabled: false, title: DEFAULT_FORM_TITLE, subtitle: DEFAULT_FORM_SUBTITLE, fields: [], notifyPicker: false, selectable: [] };
  const fields = await listFields();
  const notifyPicker = Boolean(Number(settings.notify_picker));
  const selectable = notifyPicker ? await listSelectableRecipients() : [];
  return {
    enabled: true,
    title: cleanText(settings.form_title) || DEFAULT_FORM_TITLE,
    subtitle: cleanText(settings.form_subtitle) || DEFAULT_FORM_SUBTITLE,
    fields,
    notifyPicker,
    selectable,
  };
}

// Admin shape used by the Settings screen.
export async function getAdminConfig() {
  const [settings, fields, recipients] = await Promise.all([
    getSettingsRow(),
    listFields(),
    listRecipientIds(),
  ]);
  return {
    enabled: Boolean(Number(settings.enabled)),
    notifyPicker: Boolean(Number(settings.notify_picker)),
    title: settings.form_title || '',
    subtitle: settings.form_subtitle || '',
    notifyTitle: settings.notify_title || '',
    notifyBody: settings.notify_body || '',
    fields,
    recipients,
  };
}

const adminConfigSchema = z.object({
  enabled: z.boolean(),
  notifyPicker: z.boolean().default(false),
  title: z.string().trim().max(120).default(''),
  subtitle: z.string().trim().max(255).default(''),
  notifyTitle: z.string().trim().max(200).default(''),
  notifyBody: z.string().trim().max(MULTILINE_MAX).default(''),
  recipients: z.array(z.coerce.number().int().positive()).max(500).default([]),
  fields: z
    .array(
      z.object({
        label: z.string().min(1).max(120),
        type: z.enum(['text', 'multiline']).default('text'),
        placeholder: z.string().trim().max(255).default(''),
        required: z.boolean().default(false),
      }),
    )
    .max(MAX_FIELDS)
    .default([]),
});

// A template may only reference {all} or a field label that exists in this same save,
// so a typo like {Emial} fails here instead of silently reaching the notification.
function assertTemplateTokens(template, labels, field) {
  const known = new Set(labels.map((l) => l.trim().toLowerCase()));
  const unknown = [...String(template || '').matchAll(/\{([^{}]+)\}/g)]
    .map((m) => m[1].trim())
    .filter((token) => token.toLowerCase() !== 'all' && !known.has(token.toLowerCase()));
  if (unknown.length)
    throw new AppError(400, 'UNKNOWN_TOKEN', `${field}: unknown placeholder${unknown.length > 1 ? 's' : ''} {${unknown.join('}, {')}}. Use a field label or {all}.`);
}

export async function saveAdminConfig(input) {
  const data = adminConfigSchema.parse(input);

  if (data.enabled && !data.fields.length)
    throw new AppError(400, 'NO_FIELDS', 'Add at least one field before enabling the form.');
  if (data.notifyPicker && !data.recipients.length)
    throw new AppError(400, 'PICKER_NEEDS_RECIPIENTS', 'Add at least one user to notify before enabling the picker.');

  const labels = data.fields.map((f) => cleanText(f.label));
  assertTemplateTokens(data.notifyTitle, labels, 'Notification title');
  assertTemplateTokens(data.notifyBody, labels, 'Notification message');

  await withTransaction(async (conn) => {
    await conn.execute(
      `INSERT INTO quick_entry_settings (id, enabled, notify_picker, form_title, form_subtitle, notify_title, notify_body)
       VALUES (1, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE enabled = VALUES(enabled), notify_picker = VALUES(notify_picker),
         form_title = VALUES(form_title), form_subtitle = VALUES(form_subtitle),
         notify_title = VALUES(notify_title), notify_body = VALUES(notify_body)`,
      [
        data.enabled ? 1 : 0,
        data.notifyPicker ? 1 : 0,
        cleanText(data.title) || null,
        cleanText(data.subtitle) || null,
        cleanText(data.notifyTitle) || null,
        cleanText(data.notifyBody) || null,
      ],
    );
    // Full replace of the field list is safe: submitted entries snapshot their own labels.
    await conn.execute('DELETE FROM quick_entry_fields');
    for (let i = 0; i < data.fields.length; i += 1) {
      const f = data.fields[i];
      await conn.execute(
        'INSERT INTO quick_entry_fields (label, type, placeholder, required, display_order) VALUES (?, ?, ?, ?, ?)',
        [cleanText(f.label), f.type, cleanText(f.placeholder) || null, f.required ? 1 : 0, i],
      );
    }
    await conn.execute('DELETE FROM quick_entry_recipients');
    if (data.recipients.length) {
      const ids = [...new Set(data.recipients.map(Number))].filter((n) => Number.isSafeInteger(n) && n > 0);
      if (ids.length) {
        const placeholders = ids.map(() => '?').join(',');
        // Only active users can be recipients; parameterized to avoid injection.
        await conn.execute(
          `INSERT IGNORE INTO quick_entry_recipients (user_id) SELECT id FROM users WHERE id IN (${placeholders}) AND is_active = 1`,
          ids,
        );
      }
    }
  });
  return getAdminConfig();
}

const submitSchema = z.object({
  turnstileToken: z.string().min(1),
  notifyUserIds: z.array(z.coerce.number().int().positive()).max(500).default([]),
  fields: z
    .array(z.object({ id: z.coerce.number().int().positive(), value: z.string().max(MULTILINE_MAX) }))
    .max(MAX_FIELDS)
    .default([]),
});

// Unauthenticated submit: verify Turnstile, validate against the CURRENT field
// definitions, store the entry snapshot, and fan out one notification per recipient.
export async function submitEntry(req) {
  const data = submitSchema.parse(req.body ?? {});

  const settings = await getSettingsRow();
  if (!Number(settings.enabled)) throw new AppError(403, 'QUICK_ENTRY_DISABLED', 'This form is not accepting submissions.');

  const turnstileOk = await verifyTurnstile(data.turnstileToken, req.ip);
  if (!turnstileOk) throw new AppError(400, 'TURNSTILE_FAILED', 'Human verification failed. Please try again.');

  const defs = await listFields();
  if (!defs.length) throw new AppError(400, 'NO_FIELDS', 'This form has no fields configured yet.');
  const defById = new Map(defs.map((f) => [Number(f.id), f]));
  const submitted = new Map(data.fields.map((f) => [Number(f.id), f.value]));

  // Reject ids that are no longer on the form (stale client).
  for (const id of submitted.keys()) {
    if (!defById.has(id)) throw new AppError(400, 'UNKNOWN_FIELD', 'The form changed, please reload and try again.');
  }

  const snapshotFields = [];
  for (const def of defs) {
    const raw = submitted.get(Number(def.id));
    const value = raw === undefined ? '' : cleanText(raw);
    if (def.required && value === '') throw new AppError(400, 'REQUIRED_FIELD', `${def.label} is required.`);
    const cap = def.type === 'multiline' ? MULTILINE_MAX : TEXT_MAX;
    if (value.length > cap) throw new AppError(400, 'FIELD_TOO_LONG', `${def.label} is too long.`);
    snapshotFields.push({ id: def.id, label: def.label, type: def.type, value });
  }

  const snapshot = { fields: snapshotFields };

  // Admin templates win; otherwise the title shows the first answered field and the
  // notification body is rendered from the field list by the client.
  const firstAnswer = snapshotFields.find((f) => f.value)?.value || '';
  const rawTitle = settings.notify_title
    ? renderTemplate(settings.notify_title, snapshotFields)
    : `New entry: ${firstAnswer}`;
  const title = (cleanText(rawTitle.replace(/\s+/g, ' ')) || 'New entry').slice(0, 200);
  if (settings.notify_body)
    snapshot.message = renderTemplate(settings.notify_body, snapshotFields).slice(0, MULTILINE_MAX);

  // Decide who to notify: if the picker is on, only the submitter's valid picks
  // (which must be a subset of the admin's configured pool); otherwise everyone.
  const poolIds = await listRecipientIds();
  let recipients;
  if (Number(settings.notify_picker)) {
    const allowed = new Set(poolIds);
    const picked = [...new Set(data.notifyUserIds.map(Number))].filter((id) => allowed.has(id));
    if (!picked.length) throw new AppError(400, 'NO_RECIPIENT', 'Select at least one person to notify.');
    recipients = picked;
  } else {
    recipients = poolIds;
  }

  return withTransaction(async (conn) => {
    const [result] = await conn.execute(
      'INSERT INTO quick_entries (submitter_ip, values_json) VALUES (?, ?)',
      [String(req.ip ?? '').slice(0, 64) || null, JSON.stringify(snapshot)],
    );
    const entryId = result.insertId;
    const body = JSON.stringify(snapshot);
    for (const userId of recipients) {
      await conn.execute(
        'INSERT INTO notifications (user_id, kind, entry_id, title, body) VALUES (?, ?, ?, ?, ?)',
        [userId, 'quick_entry', entryId, title, body],
      );
    }
    return { id: entryId, notified: recipients.length };
  });
}
