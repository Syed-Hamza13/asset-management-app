import { pool } from '../../config/db.js';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/errors.js';
import { MAX_ENTRIES, isIpInList, parseIp, parseIpList } from '../../utils/ipList.js';

// Three rows in app_settings drive this feature. Both flags default to off, so
// an unfinished or unusable configuration can never lock anyone out.
const KEY_LOGIN = 'ip_access_login_enabled';
const KEY_QUICK_ENTRY = 'ip_access_quick_entry_enabled';
const KEY_LIST = 'ip_access_list';

const LABELS = { login: 'Sign-in', quick_entry: 'Quick Entry' };

export function purposeLabel(purpose) {
  return LABELS[purpose] ?? purpose;
}

// The deployed container is reached directly (no reverse proxy), so
// X-Forwarded-For is attacker-controlled while app.set('trust proxy', 1) is on
// — req.ip can be spoofed with a single header. The socket address is the only
// value a client cannot forge, so the gate reads it and ignores the header.
export function clientIp(req) {
  const socket = req?.socket ?? req?.connection;
  const raw = socket?.remoteAddress ?? '';
  const parsed = parseIp(raw);
  if (parsed?.mappedFrom) return { raw, ip: { family: 4, value: parsed.mappedFrom } };
  return { raw, ip: parsed };
}

async function readSettings() {
  const [rows] = await pool.execute(
    'SELECT setting_key, setting_value FROM app_settings WHERE setting_key IN (?, ?, ?)',
    [KEY_LOGIN, KEY_QUICK_ENTRY, KEY_LIST]
  );
  const byKey = new Map(rows.map((row) => [row.setting_key, String(row.setting_value ?? '')]));
  const flag = (key) => String(byKey.get(key) ?? 'false').toLowerCase() === 'true';
  return {
    loginEnabled: flag(KEY_LOGIN),
    quickEntryEnabled: flag(KEY_QUICK_ENTRY),
    list: byKey.get(KEY_LIST) ?? '',
  };
}

async function writeSetting(key, value) {
  await pool.execute(
    `INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
    [key, value]
  );
}

// Fail-open by design: a block requires an enabled flag *and* at least one
// usable entry. Anything else (toggle off, empty list, unparsable addresses,
// missing socket info) allows access and logs why, so a mistyped allowlist
// degrades into the previous behaviour instead of a lockout.
export async function decideAccess(req, purpose) {
  const { raw, ip } = clientIp(req);
  if (env.IP_ACCESS_ENFORCE === 'false') return { allowed: true, reason: 'disabled-by-env', raw, ip };

  const settings = await readSettings();
  const enabled = purpose === 'login' ? settings.loginEnabled : settings.quickEntryEnabled;
  if (!enabled) return { allowed: true, reason: 'not-enabled', raw, ip };

  const { entries, invalid } = parseIpList(settings.list);
  if (entries.length === 0) {
    console.warn(`IP access gate for ${purpose}: no valid entries configured, allowing access from ${raw}.`);
    return { allowed: true, reason: 'no-valid-entries', raw, ip, invalid };
  }
  if (!ip) {
    console.warn(`IP access gate for ${purpose}: could not read the client address, allowing access.`);
    return { allowed: true, reason: 'unknown-client-ip', raw, ip, entries, invalid };
  }
  const allowed = isIpInList(ip, entries);
  if (!allowed) console.warn(`IP access gate blocked ${purpose} from ${raw} (allowlist has ${entries.length} entries).`);
  return { allowed, reason: allowed ? 'matched' : 'not-in-allowlist', raw, ip, entries, invalid };
}

export async function isIpAllowed(req, purpose) {
  return (await decideAccess(req, purpose)).allowed;
}

// The login page reads this before rendering the Quick Entry card. When the
// caller's IP is gated we report the form as disabled, so the card disappears
// with no client-side change.
export async function gateQuickEntryConfig(config, req) {
  if (!config?.enabled) return config;
  const allowed = await isIpAllowed(req, 'quick_entry');
  return allowed ? config : { ...config, enabled: false };
}

// Single shape used by the Settings screen (and returned after a save).
export async function getAdminView(req) {
  const settings = await readSettings();
  const { entries, invalid } = parseIpList(settings.list);
  const { raw, ip } = clientIp(req);
  return {
    ...settings,
    entries: entries.map((entry) => ({ raw: entry.raw, kind: entry.kind, family: entry.family })),
    invalid,
    entryCount: entries.length,
    invalidCount: invalid.length,
    maxEntries: MAX_ENTRIES,
    yourIp: raw,
    yourIpAllowed: ip ? isIpInList(ip, entries) : false,
    enforced: env.IP_ACCESS_ENFORCE !== 'false',
  };
}

export async function saveSettings(req, body) {
  const list = String(body.list ?? '').trim();
  const parsed = parseIpList(list);
  if (parsed.invalid.length > 0) {
    const details = parsed.invalid.slice(0, 5).map((item) => `"${item.raw}" — ${item.error}`).join('; ');
    throw new AppError(400, 'INVALID_IP_ENTRY', `Fix these entries before saving: ${details}`);
  }
  if (parsed.total > MAX_ENTRIES) {
    throw new AppError(400, 'TOO_MANY_IP_ENTRIES', `The allowlist accepts at most ${MAX_ENTRIES} entries.`);
  }
  const wantsEnforcement = body.loginEnabled === true || body.quickEntryEnabled === true;
  if (wantsEnforcement && parsed.entries.length === 0) {
    throw new AppError(400, 'EMPTY_IP_ALLOWLIST', 'Add at least one IP address before turning a switch on.');
  }

  await writeSetting(KEY_LOGIN, body.loginEnabled === true ? 'true' : 'false');
  await writeSetting(KEY_QUICK_ENTRY, body.quickEntryEnabled === true ? 'true' : 'false');
  await writeSetting(KEY_LIST, list);

  return getAdminView(req);
}
