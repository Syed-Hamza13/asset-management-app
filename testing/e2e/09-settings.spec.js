import { test, expect } from '@playwright/test';
import {
  apiGet,
  expectChecked,
  expectLabels,
  expectValues,
  fieldIn,
  watchWrites,
} from '../helpers/app.js';

// A settings card is the Card that contains its <h3> title. Nothing in this file
// ever clicks Save/Test/Clear: those are the only buttons that write, and this
// suite runs against the live production database.
const card = (page, title) =>
  page.locator('main div.rounded-2xl').filter({ has: page.getByRole('heading', { name: title, exact: true }) });

const CARD_TITLES = [
  'Application branding',
  'Turnstile (human verification)',
  'Network restriction (IP allowlist)',
  'Quick Entry',
  'SMTP (email delivery)',
  'Change password',
];

test.describe('settings', () => {
  test('the admin sees every card, in the documented order', async ({ page, request }) => {
    const writes = watchWrites(page);
    const me = await apiGet(request, '/auth/me');
    expect(me.user.role, 'this suite needs an admin session').toBe('admin');

    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Settings & Security', exact: true })).toBeVisible();
    await expect(page.getByText('Manage your account and application branding.')).toBeVisible();

    const titles = await page
      .locator('main h3')
      .evaluateAll((els) => els.map((el) => el.textContent.trim()));
    expect(titles).toEqual(CARD_TITLES);
    expect(writes, `opening Settings must not write: ${writes.join(', ')}`).toEqual([]);
  });

  test('the Turnstile card mirrors the server and only Save can change it', async ({ page, request }) => {
    const writes = watchWrites(page);
    const cfg = await apiGet(request, '/settings/turnstile');
    await page.goto('/settings');
    const box = card(page, 'Turnstile (human verification)');
    await expect(box.getByText(cfg.enabled ? 'Enabled' : 'Disabled', { exact: true })).toBeVisible();
    const toggle = box.getByLabel('Require Turnstile verification', { exact: true });
    expect(await toggle.isChecked()).toBe(cfg.enabled);

    const save = box.getByRole('button', { name: 'Save', exact: true });
    await expect(save).toBeDisabled();

    await toggle.setChecked(!cfg.enabled);
    await expect(save).toBeEnabled();
    await toggle.setChecked(cfg.enabled);
    await expect(save).toBeDisabled();
    expect(writes, `flipping the switch before Save must not write: ${writes.join(', ')}`).toEqual([]);

    const after = await apiGet(request, '/settings/turnstile');
    expect(after.enabled).toBe(cfg.enabled);
  });

  test('the IP allowlist card shows the stored list and the entry counter', async ({ page, request }) => {
    const writes = watchWrites(page);
    const cfg = await apiGet(request, '/settings/ip-access');
    await page.goto('/settings');
    const box = card(page, 'Network restriction (IP allowlist)');

    await expect(box.getByText(cfg.loginEnabled || cfg.quickEntryEnabled ? 'Active' : 'Inactive', { exact: true })).toBeVisible();
    await expect(box.getByText('Only the addresses or networks listed below can use this app.', { exact: false })).toBeVisible();
    await expect(box.locator('span.font-mono')).toHaveText(cfg.yourIp || 'unknown');

    const appToggle = box.locator('label').filter({ hasText: 'Restrict the whole app' }).locator('input');
    const qeToggle = box.locator('label').filter({ hasText: 'Restrict Quick Entry' }).locator('input');
    expect(await appToggle.isChecked()).toBe(cfg.loginEnabled);
    expect(await qeToggle.isChecked()).toBe(cfg.quickEntryEnabled);

    const list = box.locator('textarea');
    await expect(list).toHaveValue(cfg.list || '');
    await expect(
      box.getByText(`${cfg.entryCount} of ${cfg.maxEntries} entries in use.`, { exact: false }),
    ).toBeVisible();

    // Lock-out warning and break-glass notice appear only when they are true.
    const lockout = (cfg.loginEnabled || cfg.quickEntryEnabled) && !cfg.yourIpAllowed;
    await expect(box.getByText('is not on the saved list', { exact: false })).toHaveCount(lockout ? 1 : 0);
    await expect(box.getByText('IP_ACCESS_ENFORCE=false', { exact: false })).toHaveCount(
      cfg.enforced === false ? 1 : 0,
    );
    await expect(box.getByText(`${cfg.invalidCount} saved entries could not be read`)).toHaveCount(
      cfg.invalidCount > 0 ? 1 : 0,
    );

    const save = box.getByRole('button', { name: 'Save', exact: true });
    await expect(save).toBeDisabled();
    await list.fill(`${cfg.list || ''}\n203.0.113.7`);
    await expect(save).toBeEnabled();
    await list.fill(cfg.list || '');
    await expect(save).toBeDisabled();

    // "Add to list" is client-side only, and never repeats an address already stored.
    const addYourIp = box.getByRole('button', { name: 'Add to list', exact: true });
    await addYourIp.click();
    const alreadyListed = (cfg.list || '')
      .split(/[\n,;]+/)
      .map((entry) => entry.trim())
      .includes(cfg.yourIp);
    if (alreadyListed) {
      await expect(list).toHaveValue(cfg.list || '');
      await expect(save).toBeDisabled();
    } else {
      await expect(list).toHaveValue(`${(cfg.list || '').trim()}\n${cfg.yourIp}`.trim());
      await list.fill(cfg.list || '');
      await expect(save).toBeDisabled();
    }

    expect(writes, `network settings may only change through Save: ${writes.join(', ')}`).toEqual([]);
    const after = await apiGet(request, '/settings/ip-access');
    expect(after).toEqual(cfg);
  });

  test('the Quick Entry card is a faithful mirror of the saved configuration', async ({
    page,
    request,
  }) => {
    const writes = watchWrites(page);
    const [cfg, users] = await Promise.all([apiGet(request, '/quick-entry'), apiGet(request, '/users')]);
    const active = users.filter((u) => u.isActive);

    await page.goto('/settings');
    const box = card(page, 'Quick Entry');
    await expect(
      box.getByText('Submissions do not create assets; they notify the users you pick below.', {
        exact: false,
      }),
    ).toBeVisible();
    const enabled = box.getByLabel(cfg.enabled ? 'Enabled' : 'Disabled', { exact: true });
    expect(await enabled.isChecked()).toBe(cfg.enabled);

    await expect(await fieldIn(box, 'Form heading')).toHaveValue(cfg.title);
    await expect(await fieldIn(box, 'Sub-heading')).toHaveValue(cfg.subtitle);

    const labelInputs = box.locator('input[placeholder="Field label"]');
    await expectValues(labelInputs, cfg.fields.map((f) => f.label));
    await expectValues(box.locator('div.rounded-xl.border select'), cfg.fields.map((f) => f.type));
    await expectValues(
      box.locator('input[placeholder^="Placeholder text"]'),
      cfg.fields.map((f) => f.placeholder || ''),
    );
    await expectChecked(
      box.locator('label').filter({ hasText: /^Required$/ }).locator('input'),
      cfg.fields.map((f) => f.required),
    );

    // The token list is built from the field labels, plus {all}.
    for (const token of [...cfg.fields.map((f) => `{${f.label}}`), '{all}']) {
      await expect(box.locator('code').filter({ hasText: token })).toBeVisible();
    }
    await expect(box.getByLabel('Notification title', { exact: true })).toHaveValue(cfg.notifyTitle);
    // Firefox gives a textarea wrapped in a label the accessible name
    // "<label> <placeholder>", so an exact getByLabel can never match it.
    await expect(await fieldIn(box, 'Notification message')).toHaveValue(cfg.notifyBody);

    const picker = box
      .locator('label')
      .filter({ hasText: 'Let the person submitting choose who to notify' })
      .locator('input');
    expect(await picker.isChecked()).toBe(cfg.notifyPicker);

    const recipientLabels = box.locator('div.max-h-56 label span.truncate');
    const expectedNames = active.map((u) => (u.displayName ? `${u.displayName} (${u.email})` : u.email));
    await expect(recipientLabels).toHaveText(expectedNames);
    await expect(box.locator('div.max-h-56 label input:checked')).toHaveCount(cfg.recipients.length);
    await expect(box.getByRole('button', { name: 'Save Quick Entry settings', exact: true })).toBeVisible();

    // Add a row, check it is blank, remove it again - all client-side.
    const before = cfg.fields.length;
    await box.getByRole('button', { name: '+ Add field', exact: true }).click();
    await expect(box.locator('input[placeholder="Field label"]')).toHaveCount(before + 1);
    await expect(box.locator('div.rounded-xl.border button', { hasText: 'Remove' }).last()).toHaveText('Remove');
    await box.locator('button', { hasText: /^Remove$/ }).last().click();
    await expect(box.locator('input[placeholder="Field label"]')).toHaveCount(before);

    expect(writes, `editing the draft must not save it: ${writes.join(', ')}`).toEqual([]);
    const after = await apiGet(request, '/quick-entry');
    expect(after).toEqual(cfg);
  });

  test('the SMTP card shows the settings but never the stored password', async ({ page, request }) => {
    const writes = watchWrites(page);
    const cfg = await apiGet(request, '/settings/smtp');
    await page.goto('/settings');
    const box = card(page, 'SMTP (email delivery)');

    await expect(box.getByText(cfg.configured ? 'Configured' : 'Not configured', { exact: true })).toBeVisible();
    await expect(box.getByLabel('Host', { exact: true })).toHaveValue(cfg.host);
    await expect(box.getByLabel('Port', { exact: true })).toHaveValue(String(cfg.port));
    await expect(box.getByLabel('Username', { exact: true })).toHaveValue(cfg.username);
    await expect(await fieldIn(box, 'From email')).toHaveValue(cfg.fromEmail);
    await expect(box.getByLabel('From name', { exact: true })).toHaveValue(cfg.fromName);
    await expect(box.getByLabel('Reply-To (optional)', { exact: true })).toHaveValue(cfg.replyTo);

    // Security contract: the API may report that a password exists, never what it is.
    expect(Object.keys(cfg)).not.toContain('password');
    expect(JSON.stringify(cfg)).not.toMatch(/"password"\s*:/);
    const password = await fieldIn(box, 'Password');
    await expect(password).toHaveValue('');
    await expect(password).toHaveAttribute('type', 'password');
    await expect(
      box.getByText(cfg.passwordConfigured ? 'Stored. Leave blank to keep, or type to replace.' : 'Not set.'),
    ).toBeVisible();
    await expect(box.getByRole('button', { name: 'Clear password', exact: true })).toHaveCount(
      cfg.passwordConfigured ? 1 : 0,
    );

    expect(await box.getByLabel('Use TLS/SSL (secure)', { exact: true }).isChecked()).toBe(cfg.secure);
    expect(await box.getByLabel('Enabled', { exact: true }).last().isChecked()).toBe(cfg.enabled);

    // Test connection and Send test email both reach the mail server, so they are
    // only checked for presence here.
    await expect(box.getByRole('button', { name: 'Test connection', exact: true })).toBeVisible();
    const sendTest = box.getByRole('button', { name: 'Send test email', exact: true });
    await expect(sendTest).toBeVisible();
    expect(await sendTest.isDisabled()).toBe(!cfg.configured);

    expect(writes, `reading SMTP settings must not write: ${writes.join(', ')}`).toEqual([]);
  });

  test('the change-password form is validated in the browser before anything is sent', async ({
    page,
  }) => {
    const writes = watchWrites(page);
    await page.goto('/settings');
    const box = card(page, 'Change password');
    await expectLabels(box, ['Current password', 'New password', 'Confirm new password']);

    await box.getByRole('button', { name: 'Change password', exact: true }).click();
    expect(writes, `an empty form must never reach the API: ${writes.join(', ')}`).toEqual([]);

    await (await fieldIn(box, 'New password')).fill('short');
    await box.getByRole('button', { name: 'Change password', exact: true }).click();
    expect(writes, `a short password must never reach the API: ${writes.join(', ')}`).toEqual([]);

    await (await fieldIn(box, 'New password')).fill('');
    await expect(await fieldIn(box, 'New password')).toHaveValue('');
  });
});
