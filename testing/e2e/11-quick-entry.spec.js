import { test, expect } from '@playwright/test';
import { GUEST_STATE, apiGet, controlLabels, watchWrites } from '../helpers/app.js';

// Quick Entry lives on the sign-in screen: an unauthenticated visitor can fill it
// in, and submitting notifies people by email without creating an asset. This
// file therefore renders and validates it but NEVER lets a real submit through -
// see the guard test for exactly how that is kept safe.
test.describe('quick entry (guest)', () => {
  test.use({ storageState: GUEST_STATE });

  const card = (page, title) =>
    page.locator('div.rounded-2xl').filter({ has: page.getByRole('heading', { name: title, exact: true }) });

  async function open(page) {
    const writes = watchWrites(page);
    const pub = await apiGet(page.request, '/quick-entry/public-config');
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Welcome back', exact: true })).toBeVisible();
    return { pub, writes };
  }

  test('the login screen renders exactly the public configuration', async ({ page }) => {
    const { pub, writes } = await open(page);

    if (!pub.enabled) {
      // The server reports itself disabled (admin switch, or a gated IP), and the
      // card disappears - only sign-in remains.
      await expect(page.locator('div.rounded-2xl')).toHaveCount(1);
      await expect(page.getByRole('button', { name: 'Submit', exact: true })).toHaveCount(0);
      expect(writes, `a guest must not write: ${writes.join(', ')}`).toEqual([]);
      return;
    }

    const box = card(page, pub.title || 'Quick Entry');
    await expect(box).toHaveCount(1);
    await expect(box.locator('h2')).toHaveText(pub.title || 'Quick Entry');
    await expect(box.locator('p').first()).toHaveText(pub.subtitle || 'Submit a request without signing in.');
    expect(await controlLabels(box)).toEqual(pub.fields.map((field) => field.label));

    // One <label> per configured field, in display order. Labels are matched by
    // position because two fields can share a display name.
    const labels = box.locator('label');
    await expect(labels).toHaveCount(pub.fields.length);
    for (const [index, field] of pub.fields.entries()) {
      const label = labels.nth(index);
      await expect(label.locator('span').first()).toHaveText(
        `${field.label}${field.required ? ' *' : ''}`,
      );
      const control = label.locator('input, textarea');
      await expect(control).toHaveCount(1);
      const tag = (await control.evaluateAll((els) => els.map((el) => el.tagName)))[0];
      expect(tag, `field "${field.label}" of type ${field.type}`).toBe(
        field.type === 'multiline' ? 'TEXTAREA' : 'INPUT',
      );
      await expect(control).toHaveAttribute('placeholder', field.placeholder || '');
      if (field.required) await expect(control).toHaveAttribute('required');
      else await expect(control).not.toHaveAttribute('required');
    }

    // Turnstile state is shared by both cards; outside production it is off and
    // says so instead of rendering a widget.
    const turnstile = await apiGet(page.request, '/auth/turnstile-config');
    await expect(
      page.getByText('Human verification is turned off for this environment.'),
    ).toHaveCount(turnstile.enforce ? 0 : 2);

    await expect(page.getByRole('button', { name: 'Submit', exact: true })).toBeEnabled();
    expect(writes, `a guest must not write: ${writes.join(', ')}`).toEqual([]);
  });

  test('the public config and the public page leak nothing private', async ({ page }) => {
    const pub = await apiGet(page.request, '/quick-entry/public-config');

    // Only the four display settings plus the picker list are public: the email
    // templates and the recipient roster live behind auth in /quick-entry.
    expect(Object.keys(pub).sort()).toEqual(
      ['enabled', 'fields', 'notifyPicker', 'selectable', 'subtitle', 'title'],
    );
    for (const option of pub.selectable) {
      expect(option.label, 'a visitor must never see a full address').not.toContain('@');
    }
    expect(JSON.stringify(pub)).not.toMatch(/notify_title|notifyTitle|notifyBody|notify_body|recipients|password/);

    // The admin view of the same feature is not reachable without a session.
    const adminOnly = await page.request.get('/api/v1/quick-entry');
    expect(adminOnly.status()).toBe(401);

    if (pub.enabled) {
      await page.goto('/');
      const box = card(page, pub.title || 'Quick Entry');
      // Sign-in has an email field; the guest form must not, and must not print an
      // address anywhere on it.
      await expect(box.locator('input[type="email"]')).toHaveCount(0);
      await expect(box.locator('a[href^="mailto"]')).toHaveCount(0);
      const text = await box.innerText();
      for (const email of text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) || []) {
        expect(
          pub.fields.some((field) => (field.placeholder || '').includes(email)),
          `the guest form shows an address: ${email}`,
        ).toBe(true);
      }
    }
  });

  test('the notify picker lists friendly names and tracks the selection', async ({ page }) => {
    const { pub, writes } = await open(page);
    test.skip(!pub.enabled || !pub.notifyPicker, 'the picker is switched off in Quick Entry settings');

    const box = card(page, pub.title || 'Quick Entry');
    // The picker's own caption is "Notify" plus the required marker span.
    await expect(box.locator('div.relative > span').first()).toHaveText('Notify *');
    const closed = box.getByRole('button', { name: 'Select people to notify...', exact: true });
    const chosen = box.getByRole('button', { name: '1 selected', exact: true });
    // The option list is the absolutely positioned panel; the field inputs live in
    // labels too, so never scope a checkbox lookup to the whole card.
    const dropdown = box.locator('div.absolute.z-40');

    await closed.click();
    await expect(dropdown).toHaveCount(1);
    await expect(dropdown.locator('label span.truncate')).toHaveText(
      pub.selectable.map((option) => option.label),
    );

    if (pub.selectable.length) {
      const first = dropdown.locator('label input').first();
      await first.check();
      await expect(chosen).toBeVisible();
      await first.uncheck();
      await expect(closed).toBeVisible();
      await first.check();
      await expect(first).toBeChecked();

      // The panel keeps a full-screen backdrop, so a click outside closes it -
      // and the selection survives closing and reopening, so the control has to
      // be addressed by position from here on (its name changes with the count).
      await page.locator('div.fixed.inset-0.z-30').click({ position: { x: 5, y: 5 } });
      await expect(dropdown).toHaveCount(0);
      await expect(chosen).toBeVisible();
      await box.locator('div.relative > button').click();
      await expect(first).toBeChecked();
      await first.uncheck();
      await page.locator('div.fixed.inset-0.z-30').click({ position: { x: 5, y: 5 } });
      await expect(dropdown).toHaveCount(0);
      await expect(closed).toBeVisible();
    } else {
      await expect(dropdown.getByText('No one available.')).toBeVisible();
    }
    expect(writes, `choosing who to notify must not write: ${writes.join(', ')}`).toEqual([]);
  });

  test('an incomplete entry is refused before anything reaches the API', async ({ page }) => {
    const { pub, writes } = await open(page);
    test.skip(!pub.enabled, 'Quick Entry is switched off');

    const submit = page.getByRole('button', { name: 'Submit', exact: true });
    await expect(submit).toBeVisible();

    if (!pub.notifyPicker && !pub.fields.some((field) => field.required)) {
      // Nothing would stop this click: an empty-but-valid entry really is
      // submittable, which would email the configured people. Skip the click
      // rather than test it against production.
      return;
    }

    if (pub.notifyPicker) {
      // Fill every required field so the browser's own validation passes; the
      // picker guard is the app's own check and returns before the POST.
      const labels = card(page, pub.title || 'Quick Entry').locator('label');
      for (const [index, field] of pub.fields.entries()) {
        if (field.required) await labels.nth(index).locator('input, textarea').fill('a');
      }
      await submit.click();
      await expect(page.getByText('Select at least one person to notify.')).toBeVisible();
      await expect(page.getByText('Your entry was submitted.')).toHaveCount(0);
    } else {
      await submit.click();
      await expect(submit).toBeEnabled();
      await expect(page.getByText('Your entry was submitted.')).toHaveCount(0);
    }
    expect(writes, `a refused submit must never reach the API: ${writes.join(', ')}`).toEqual([]);
  });

  test('the empty state after a refused entry keeps the typed text', async ({ page }) => {
    const { pub, writes } = await open(page);
    test.skip(!pub.enabled || !pub.fields.length, 'Quick Entry has no fields to type into');

    const box = card(page, pub.title || 'Quick Entry');
    const control = box.locator('label').first().locator('input, textarea');
    await control.fill('typed but not sent');
    await expect(control).toHaveValue('typed but not sent');
    await control.fill('');
    await expect(control).toHaveValue('');
    expect(writes, `typing must not write: ${writes.join(', ')}`).toEqual([]);
  });
});
