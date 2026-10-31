import { test, expect } from '@playwright/test';
import { GUEST_STATE, apiGet } from '../helpers/app.js';

// The admin account holds every capability, so the full nav list must render.
const NAV = [
  ['Assets', 'Assets'],
  ['Reports', 'Reports'],
  ['Common Form', 'Common Form'],
  ['Field Definitions', 'Field Definitions'],
  ['Dropdowns', 'Dropdowns'],
  ['Email Notifications', 'Email Notifications'],
  ['Email History', 'Email History'],
  ['Users', 'Users'],
  ['Settings', 'Settings & Security'],
];

test.describe('signed out', () => {
  test.use({ storageState: GUEST_STATE });

  test('only the sign-in screen is reachable and it bounces deep links', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();
    // Turnstile is bypassed outside production, so the button is enabled in dev.
    const quickEntry = await apiGet(page.request, '/quick-entry/public-config');
    await expect(
      page.getByRole('heading', { name: quickEntry.title || 'Quick Entry' }),
    ).toBeVisible();

    for (const path of ['/reports', '/users', '/fields', '/settings']) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/$/);
      await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    }
  });
});

test.describe('signed in shell', () => {
  test('sidebar exposes every admin page and the signed-in email', async ({ page }) => {
    await page.goto('/');
    const sidebar = page.locator('aside');
    for (const [label] of NAV) {
      await expect(sidebar.getByRole('link', { name: label, exact: true })).toBeVisible();
    }
    const me = await apiGet(page.request, '/auth/me');
    await expect(sidebar).toContainText(me.user.email);
    await expect(sidebar.getByRole('button', { name: 'Logout' })).toBeVisible();
    // Two bells exist in the DOM (sidebar + mobile header); only the sidebar one is live.
    await expect(sidebar.getByRole('button', { name: 'Notifications' })).toBeVisible();
  });

  test('every nav item opens its page and the page keeps its heading', async ({ page }) => {
    await page.goto('/');
    for (const [label, heading] of NAV) {
      await page.locator('aside').getByRole('link', { name: label, exact: true }).click();
      await expect(
        page.getByRole('heading', { name: heading, exact: false }).first(),
      ).toBeVisible();
    }
  });

  test('an unknown route falls back to the dashboard instead of a blank page', async ({ page }) => {
    await page.goto('/no-such-page');
    await expect(page.getByRole('heading', { name: 'Assets' })).toBeVisible();
    await expect(page.locator('aside')).toBeVisible();
  });

  test('the notification bell opens a panel that closes on an outside click', async ({ page }) => {
    await page.goto('/');
    const bell = page.locator('aside').getByRole('button', { name: 'Notifications' });
    await expect(bell).toHaveAttribute('aria-expanded', 'false');
    await bell.click();
    await expect(bell).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByText('Notifications').first()).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
    // The panel installs a full-screen backdrop, so a click anywhere else closes it.
    await page.locator('div.fixed.inset-0.z-40').click({ position: { x: 5, y: 5 } });
    await expect(bell).toHaveAttribute('aria-expanded', 'false');
  });
});
