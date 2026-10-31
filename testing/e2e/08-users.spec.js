import { test, expect } from '@playwright/test';
import { apiGet, cleanText, controlLabels, fieldIn, modal, watchWrites } from '../helpers/app.js';

const userRows = (page) => page.locator('main div.rounded-2xl.divide-y > div');

/** The button row Users.jsx renders for one account, given what it is. */
function expectedButtons({ isSelf, isAdminAccount, isActive }) {
  const buttons = ['Display name', 'Reset password'];
  if (!isAdminAccount) buttons.push('Permissions', 'Make admin');
  if (isAdminAccount && !isSelf) buttons.push('Make user');
  if (!isSelf) buttons.push(isActive ? 'Deactivate' : 'Reactivate', 'Delete');
  return buttons.sort();
}

test.describe('users', () => {
  test('every account row shows exactly what the API stores', async ({ page, request }) => {
    const writes = watchWrites(page);
    const [users, me] = await Promise.all([apiGet(request, '/users'), apiGet(request, '/auth/me')]);
    await page.goto('/users');
    await expect(page.getByRole('heading', { name: 'Users', exact: true })).toBeVisible();
    await expect(
      page.getByText('Create accounts, grant capabilities, deactivate or reset passwords.'),
    ).toBeVisible();

    const rows = userRows(page);
    await expect(rows).toHaveCount(users.length);
    for (const [index, account] of users.entries()) {
      const row = rows.nth(index);
      const isSelf = Number(account.id) === Number(me.user.id);
      const isAdminAccount = account.role === 'admin';

      await expect(row.locator('span.truncate.font-semibold')).toHaveText(
        account.displayName || account.email,
      );
      await expect(row.getByText('you', { exact: true })).toHaveCount(isSelf ? 1 : 0);
      await expect(row.getByText(account.role, { exact: true })).toBeVisible();
      await expect(row.getByText('deactivated', { exact: true })).toHaveCount(account.isActive ? 0 : 1);
      await expect(row.getByText('must change password', { exact: true })).toHaveCount(
        account.mustChangePassword ? 1 : 0,
      );

      const caption = cleanText(await row.locator('div.mt-1').innerText());
      if (account.displayName) expect(caption).toContain(account.email);
      expect(caption).toContain(
        isAdminAccount
          ? 'Full access to everything'
          : `${account.permissions.length} capabilit${account.permissions.length === 1 ? 'y' : 'ies'} granted`,
      );

      const buttons = await row
        .locator('div.flex.flex-wrap.gap-2 button')
        .evaluateAll((els) => els.map((el) => el.textContent.trim()));
      expect(buttons.sort()).toEqual(expectedButtons({ isSelf, isAdminAccount, isActive: account.isActive }));
    }
    expect(writes, `reading the user list must not write: ${writes.join(', ')}`).toEqual([]);
  });

  test('the add-user modal offers every capability and starts from the defaults', async ({
    page,
    request,
  }) => {
    const writes = watchWrites(page);
    const caps = await apiGet(request, '/users/capabilities');
    await page.goto('/users');
    await page.getByRole('button', { name: '+ Add User', exact: true }).click();

    const dialog = modal(page, 'Add User');
    await expect(dialog).toBeVisible();
    const labels = await controlLabels(dialog);
    expect(labels.slice(0, 4)).toEqual(['Email', 'Display Name', 'Temporary Password', 'Role']);
    expect(labels.slice(4).sort()).toEqual([...caps.all].sort());
    await expect(await fieldIn(dialog, 'Role')).toHaveValue('user');

    // The capability list is the server's, grouped in the page - nothing missing, nothing extra.
    const groups = await dialog
      .locator('div.text-xs.font-semibold')
      .evaluateAll((els) => els.map((el) => el.textContent.trim()));
    const checkboxes = dialog.locator('label input[type="checkbox"]');
    await expect(checkboxes).toHaveCount(caps.all.length);

    const capabilityLabels = await dialog
      .locator('label span.font-mono')
      .evaluateAll((els) => els.map((el) => el.textContent.trim()));
    expect(capabilityLabels.sort()).toEqual([...caps.all].sort());
    // A new user gets the default capabilities, pre-ticked.
    const checked = await dialog
      .locator('label:has(input[type="checkbox"]:checked) span.font-mono')
      .evaluateAll((els) => els.map((el) => el.textContent.trim()));
    expect(checked.sort()).toEqual([...caps.defaults].sort());
    expect(groups).toEqual([
      'Asset Types',
      'Assets',
      'Configuration',
      'Reports & Branding',
      'Email Notifications',
    ]);

    // An admin needs no capability list at all.
    await (await fieldIn(dialog, 'Role')).selectOption('admin');
    await expect(dialog.locator('label span.font-mono')).toHaveCount(0);
    await (await fieldIn(dialog, 'Role')).selectOption('user');
    await expect(dialog.locator('label span.font-mono')).toHaveCount(caps.all.length);

    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(writes, `drafting a user must not create one: ${writes.join(', ')}`).toEqual([]);
    await expect(userRows(page)).toHaveCount((await apiGet(request, '/users')).length);
  });

  test('the permissions modal mirrors the stored capabilities and cancels without saving', async ({
    page,
    request,
  }) => {
    const writes = watchWrites(page);
    const [users, caps] = await Promise.all([
      apiGet(request, '/users'),
      apiGet(request, '/users/capabilities'),
    ]);
    const target = users.find((account) => account.role !== 'admin');
    expect(target, 'no non-admin user exists to inspect').toBeTruthy();

    await page.goto('/users');
    await userRows(page)
      .filter({ hasText: target.email })
      .first()
      .getByRole('button', { name: 'Permissions', exact: true })
      .click();

    const dialog = modal(page, `Permissions — ${target.email}`);
    const boxes = dialog.locator('label span.font-mono');
    await expect(boxes).toHaveCount(caps.all.length);
    const states = await dialog.locator('label input[type="checkbox"]').evaluateAll((els) =>
      els.map((el) => ({ cap: el.closest('label').querySelector('span').textContent.trim(), checked: el.checked })),
    );
    expect(states.filter((s) => s.checked).map((s) => s.cap).sort()).toEqual(
      [...target.permissions].sort(),
    );

    // Ticking one box does not save it; the modal is the only place it lives.
    const first = dialog.locator('label input[type="checkbox"]').first();
    const before = await first.isChecked();
    await first.setChecked(!before);
    await expect(dialog.getByRole('button', { name: 'Save Permissions', exact: true })).toBeEnabled();

    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(writes, `permissions must not be saved by Cancel: ${writes.join(', ')}`).toEqual([]);

    const after = await apiGet(request, '/users');
    const same = after.find((account) => account.id === target.id);
    expect([...same.permissions].sort()).toEqual([...target.permissions].sort());
  });

  test('the reset-password modal refuses a short password without contacting the server', async ({
    page,
    request,
  }) => {
    const writes = watchWrites(page);
    const users = await apiGet(request, '/users');
    const target = users.find((account) => account.role !== 'admin') ?? users[0];

    await page.goto('/users');
    await userRows(page)
      .filter({ hasText: target.email })
      .first()
      .getByRole('button', { name: 'Reset password', exact: true })
      .click();

    const dialog = modal(page, `Reset Password — ${target.email}`);
    const password = await fieldIn(dialog, 'New Temporary Password');
    await expect(password).toHaveValue('');
    await expect(dialog.getByText('At least 10 characters.')).toBeVisible();

    await password.fill('short');
    await dialog.getByRole('button', { name: 'Reset Password', exact: true }).click();
    // minLength blocks the submit in the browser, so the API is never asked to change a password.
    expect(writes, `a rejected password must not be posted: ${writes.join(', ')}`).toEqual([]);
    await expect(dialog).toHaveCount(1);

    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(writes, `closing must not write either: ${writes.join(', ')}`).toEqual([]);
    const after = await apiGet(request, '/users');
    expect(
      after.find((account) => account.id === target.id).mustChangePassword,
    ).toBe(target.mustChangePassword);
  });

  test('the display-name modal starts from the stored name and cancels without writing', async ({
    page,
    request,
  }) => {
    const writes = watchWrites(page);
    const users = await apiGet(request, '/users');
    const target = users.find((account) => account.displayName) ?? users[0];

    await page.goto('/users');
    await userRows(page)
      .filter({ hasText: target.email })
      .first()
      .getByRole('button', { name: 'Display name', exact: true })
      .click();

    const dialog = modal(page, `Display Name — ${target.email}`);
    const input = await fieldIn(dialog, 'Display Name');
    await expect(input).toHaveValue(target.displayName || '');
    await expect(await input.getAttribute('maxlength')).toBe('100');
    await expect(dialog.getByText('Leave empty to fall back to the email address.')).toBeVisible();

    await input.fill('Harness draft name');
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(writes, `typing must not save: ${writes.join(', ')}`).toEqual([]);
    const after = await apiGet(request, '/users');
    expect(after.find((account) => account.id === target.id).displayName).toBe(target.displayName);
  });
});
