import { firefox } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const AUTH_FILE = path.resolve(dir, '..', '.auth', 'admin.json');
const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3000';
const EMAIL = process.env.TEST_ADMIN_EMAIL || 'techteam@eklavya.in';
const PASSWORD = process.env.TEST_ADMIN_PASSWORD || 'Eklavya@11';

/**
 * Signs in through the real API and stores the session cookie so every test
 * starts authenticated. Login is the only write the suite performs (it creates a
 * session row, never asset data).
 *
 * A still-valid cached session is reused on purpose: /api/v1/auth/login is
 * rate-limited per IP, and re-logging on every run both trips that limiter and
 * risks locking the real user out of the production app.
 */
export default async function globalSetup() {
  const health = await fetch(`${BASE_URL}/health`).catch(() => null);
  if (!health?.ok) {
    throw new Error(
      `App is not reachable at ${BASE_URL} (GET /health -> ${health?.status ?? 'no response'}). ` +
        'Start it with "npm run dev" in server/ and rebuild the client with "npm run build" in client/.',
    );
  }
  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });

  const browser = await firefox.launch({ headless: !process.env.HEADED });
  const context = await browser.newContext({
    baseURL: BASE_URL,
    ...(fs.existsSync(AUTH_FILE) ? { storageState: AUTH_FILE } : {}),
  });
  try {
    const cached = await context.request.get('/api/v1/auth/me');
    if (cached.ok()) {
      console.log('[global-setup] reusing the cached admin session');
      return;
    }
    const login = await context.request.post('/api/v1/auth/login', {
      data: { email: EMAIL, password: PASSWORD, turnstileToken: 'bypass' },
    });
    const body = await login.json().catch(() => null);
    if (!login.ok || !body?.success) {
      throw new Error(
        `Test login failed (${login.status()}): ${JSON.stringify(body)} ` +
          `(cached session at ${AUTH_FILE} is missing or expired; the login limiter unlocks automatically)`,
      );
    }
    const me = await context.request.get('/api/v1/auth/me');
    if (!me.ok()) throw new Error(`Session not accepted by /auth/me (${me.status()}).`);
    await context.storageState({ path: AUTH_FILE });
    console.log('[global-setup] signed in and cached the admin session');
  } finally {
    await context.close();
    await browser.close();
  }
}
