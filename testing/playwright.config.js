import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
export const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3000';
export const AUTH_FILE = path.join(dir, '.auth', 'admin.json');

export default defineConfig({
  testDir: dir,
  testMatch: ['e2e/**/*.spec.js'],
  outputDir: path.join(dir, '.artifacts'),
  timeout: 45_000,
  expect: { timeout: 8_000 },
  // The suite talks to the live production database, so runs stay serial: one
  // worker keeps the read-only assertions stable while staff use the app.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: path.join(dir, 'report'), open: 'never' }],
  ],
  globalSetup: path.join(dir, 'helpers', 'global-setup.js'),
  use: {
    baseURL: BASE_URL,
    storageState: AUTH_FILE,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    actionTimeout: 12_000,
  },
  projects: [
    // The desktop specs are the behaviour lock; e2e/mobile is measured at phone size.
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
      testIgnore: ['e2e/mobile/**'],
    },
    {
      // Same browser, phone viewport: this is what the 360px layout rules assert.
      name: 'firefox-phone',
      use: { ...devices['Desktop Firefox'], viewport: { width: 360, height: 800 } },
      testMatch: ['e2e/mobile/**/*.spec.js'],
    },
  ],
});
