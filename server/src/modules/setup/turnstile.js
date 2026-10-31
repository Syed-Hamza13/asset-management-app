import { env } from '../../config/env.js';
import { pool } from '../../config/db.js';

// Admin-facing runtime flag stored in app_settings. Default (row missing) is
// enabled so existing production deployments keep enforcing Turnstile.
export async function isTurnstileEnabled() {
  const [rows] = await pool.execute(
    "SELECT setting_value FROM app_settings WHERE setting_key = 'turnstile_enabled'"
  );
  if (!rows.length) return true;
  return String(rows[0].setting_value).toLowerCase() !== 'false';
}

// Public, pre-login view of whether the widget must run. `enforce` is the only
// value the client needs to decide whether a real token is required.
export async function turnstilePublicConfig() {
  const flagEnabled = await isTurnstileEnabled();
  const siteKey = env.TURNSTILE_SITE_KEY || '';
  const enforce = env.NODE_ENV === 'production' && flagEnabled && Boolean(env.TURNSTILE_SECRET_KEY);
  return { enabled: flagEnabled, enforce, siteKey };
}

// Admin view used by the Settings screen.
export async function getTurnstileSettings() {
  const enabled = await isTurnstileEnabled();
  return {
    enabled,
    hasSiteKey: Boolean(env.TURNSTILE_SITE_KEY),
    hasSecretKey: Boolean(env.TURNSTILE_SECRET_KEY),
    enforcedInProduction: env.NODE_ENV === 'production',
  };
}

export async function setTurnstileEnabled(value) {
  await pool.execute(
    "INSERT INTO app_settings (setting_key, setting_value) VALUES ('turnstile_enabled', ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)",
    [value ? 'true' : 'false']
  );
  return getTurnstileSettings();
}

export async function verifyTurnstile(token, remoteip) {
  if (env.NODE_ENV !== 'production') return true;
  if (!(await isTurnstileEnabled())) return true;
  if (!env.TURNSTILE_SECRET_KEY) {
    console.error('Turnstile verification failed: TURNSTILE_SECRET_KEY is missing.');
    return false;
  }

  const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token });
  if (remoteip) body.set('remoteip', remoteip);

  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!response.ok) {
    console.error('Turnstile verification failed: HTTP', response.status);
    return false;
  }

  const result = await response.json();
  if (!result.success) {
    console.error('Turnstile verification failed:', result['error-codes'] || 'unknown reason');
    return false;
  }

  return true;
}
