import { firefox } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASELINE_FILE, currentContract } from './contract.js';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3000';
const EMAIL = process.env.TEST_ADMIN_EMAIL || 'techteam@eklavya.in';
const PASSWORD = process.env.TEST_ADMIN_PASSWORD || 'Eklavya@11';

// node helpers/capture-snapshot.js
//
// Records the live API contract into baselines/api-contract.json. Run it before a
// refactor, and again afterwards only when a change to the contract was intended.
async function main() {
  const browser = await firefox.launch({ headless: true });
  const context = await browser.newContext({ baseURL: BASE_URL });
  const login = await context.request.post('/api/v1/auth/login', {
    data: { email: EMAIL, password: PASSWORD, turnstileToken: 'bypass' },
  });
  if (!login.ok()) throw new Error(`login failed: ${login.status()}`);

  const snapshot = { capturedAt: new Date().toISOString(), base: BASE_URL, ...(await currentContract(context.request)) };

  await context.close();
  await browser.close();

  fs.mkdirSync(path.dirname(BASELINE_FILE), { recursive: true });
  fs.writeFileSync(BASELINE_FILE, JSON.stringify(snapshot, null, 2));
  console.log(
    `Wrote ${path.relative(dir, BASELINE_FILE)}: ${Object.keys(snapshot.types).length} types/dropdowns, ${Object.keys(snapshot.endpoints).length} endpoints.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
