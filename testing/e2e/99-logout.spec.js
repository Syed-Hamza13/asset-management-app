import { test, expect } from '@playwright/test';
import { AUTH_FILE } from '../playwright.config.js';
import { GUEST_STATE, cleanText, watchWrites } from '../helpers/app.js';

// Runs last on purpose: it destroys the session that every other spec reuses.
// Signing back in at the end rewrites .auth/admin.json, so a second run of the
// suite does not need the login limiter's patience.
test.describe('logout', () => {
  const cookieName = 'sid';

  test('Logout ends the session, and signing in again restores it', async ({ page }) => {
    const writes = watchWrites(page);
    await page.goto('/');
    const bell = page.locator('aside').getByRole('button', { name: 'Notifications' });
    await expect(bell).toBeVisible();

    await page.locator('aside').getByRole('button', { name: 'Logout' }).click();
    await expect(page.getByRole('heading', { name: 'Welcome back', exact: true })).toBeVisible();
    await expect(page.locator('aside')).toHaveCount(0);

    // The cookie is gone and the API says so.
    const cookies = await page.context().cookies();
    expect(cookies.filter((c) => c.name === cookieName)).toEqual([]);
    const me = await page.request.get('/api/v1/auth/me');
    expect(me.status()).toBe(401);
    expect((await me.json()).error.code).toBe('UNAUTHENTICATED');

    // A signed-out visitor cannot reach a page: the router canonicalises to "/".
    for (const path of ['/reports', '/users', '/fields']) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/$/);
      await expect(page.getByRole('heading', { name: 'Welcome back', exact: true })).toBeVisible();
    }

    // Sign back in through the UI, exactly the way an office user does. Scoped to
    // the sign-in card because the Quick Entry card can hold a field of the same
    // name, and a label's accessible name carries the red " *" required marker.
    await page.goto('/');
    const signedOutEmail = process.env.TEST_ADMIN_EMAIL || 'techteam@eklavya.in';
    const signIn = page
      .locator('div.rounded-2xl')
      .filter({ has: page.getByRole('heading', { name: 'Welcome back', exact: true }) });
    await signIn.getByLabel('Email').fill(signedOutEmail);
    await signIn.getByLabel('Password').fill(process.env.TEST_ADMIN_PASSWORD || 'Eklavya@11');
    await signIn.getByRole('button', { name: 'Login', exact: true }).click();
    await expect(page.locator('aside')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Assets', exact: true }).first()).toBeVisible();
    expect(cleanText(await page.locator('aside').innerText())).toContain(signedOutEmail);

    await page.context().storageState({ path: AUTH_FILE });
    // Login/logout are the only writes this suite performs, and only in this test.
    for (const write of writes) {
      expect(
        /^POST \/api\/v1\/auth\/(login|logout)$/.test(write),
        `unexpected write: ${write}`,
      ).toBe(true);
    }
    expect(writes).toContain('POST /api/v1/auth/logout');
    expect(writes).toContain('POST /api/v1/auth/login');
  });
});

test.describe('session state after logout', () => {
  test('a browser without the session cookie starts signed out', async ({ browser }) => {
    const context = await browser.newContext({ storageState: GUEST_STATE });
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Welcome back', exact: true })).toBeVisible();
    // The login button waits for a verification token; outside production the
    // Turnstile component supplies "bypass" immediately, so it is enabled.
    await expect(page.getByRole('button', { name: 'Login', exact: true })).toBeEnabled();
    await expect(page.locator('aside')).toHaveCount(0);
    await context.close();
  });
});
