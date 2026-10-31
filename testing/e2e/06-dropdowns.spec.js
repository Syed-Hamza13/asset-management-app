import { test, expect } from '@playwright/test';
import {
  apiGet,
  cleanText,
  columnTexts,
  expectLabels,
  expectNoModal,
  fieldIn,
  modal,
  watchWrites,
} from '../helpers/app.js';

// The left-hand list is the only Card with `divide-y` on this page, and its
// entries are the `block w-full` buttons Dropdowns.jsx renders per dropdown.
const listButtons = (page) => page.locator('main div.divide-y > button.block');
const optionRows = (page) => page.locator('main table tbody tr');

async function cellsOf(scope) {
  const raw = await scope.evaluateAll((els) => els.map((el) => el.innerText));
  return raw.map(cleanText);
}

test.describe('dropdowns', () => {
  test('the list matches the API and every entry shows its option count', async ({ page, request }) => {
    const items = await apiGet(request, '/dropdowns');
    await page.goto('/dropdowns');
    await expect(page.getByRole('heading', { name: 'Dropdowns', exact: true })).toBeVisible();
    await expect(page.getByText('Reusable option sets.')).toBeVisible();
    await expect(page.getByText('Choose a dropdown from the left to manage its options.')).toBeVisible();

    const buttons = listButtons(page);
    await expect(buttons).toHaveCount(items.length);
    const names = await cellsOf(buttons.locator('div.font-medium'));
    const counts = await cellsOf(buttons.locator('div.text-xs'));
    expect(names).toEqual(items.map((item) => item.name));
    expect(counts).toEqual(items.map((item) => `${item.option_count} options`));
  });

  test('selecting a dropdown shows exactly its stored options', async ({ page, request }) => {
    const items = await apiGet(request, '/dropdowns');
    const withOptions = items.filter((item) => item.option_count > 0);
    expect(withOptions.length, 'no dropdown has any option to check').toBeGreaterThan(0);

    for (const item of withOptions.slice(0, 4)) {
      await page.goto('/dropdowns');
      await listButtons(page).filter({ hasText: item.name }).first().click();

      const detail = await apiGet(request, `/dropdowns/${item.id}`);
      const active = detail.options.filter((option) => option.is_active);
      await expect(page.getByRole('heading', { name: item.name, exact: true })).toBeVisible();
      await expect(
        page.getByText('Manage options. Changes are applied wherever this dropdown is used.'),
      ).toBeVisible();

      const rows = optionRows(page);
      await expect(rows).toHaveCount(detail.options.length);
      expect(await columnTexts(rows, 0)).toEqual(detail.options.map((o) => cleanText(o.label)));
      expect(await columnTexts(rows, 1)).toEqual(detail.options.map((o) => cleanText(o.value)));
      expect(await columnTexts(rows, 2)).toEqual(
        detail.options.map((o) => (o.is_active ? 'Active' : 'Inactive')),
      );

      // The add-option form is always present and is the only thing on the card
      // that can create data, so its labels are part of the locked behaviour.
      const card = page.locator('main div.rounded-2xl').last();
      await expectLabels(card, ['Label', 'Value']);
      await expect(card.getByRole('button', { name: 'Add option', exact: true })).toBeVisible();

      // Only active options offer Deactivate; every option offers Edit.
      await expect(rows.locator('button', { hasText: 'Deactivate' })).toHaveCount(active.length);
      await expect(rows.locator('button', { hasText: /^Edit$/ })).toHaveCount(detail.options.length);
    }
  });

  test('the create-dropdown modal opens and closes without writing', async ({ page, request }) => {
    const writes = watchWrites(page);
    const items = await apiGet(request, '/dropdowns');
    await page.goto('/dropdowns');

    await page.getByRole('button', { name: '+ Add', exact: true }).click();
    const dialog = modal(page, 'Create Dropdown');
    await expect(dialog).toBeVisible();
    await expectLabels(dialog, ['Dropdown Name']);
    await expect(await fieldIn(dialog, 'Dropdown Name')).toHaveValue('');

    await dialog.getByRole('button', { name: 'Close Create Dropdown' }).click();
    await expectNoModal(page);
    expect(writes, `the modal must be read-only: ${writes.join(', ')}`).toEqual([]);
    await expect(listButtons(page)).toHaveCount(items.length);
  });

  test('the edit-name modal starts from the stored name and closes without writing', async ({
    page,
    request,
  }) => {
    const writes = watchWrites(page);
    const items = await apiGet(request, '/dropdowns');
    expect(items.length, 'no dropdown exists to rename').toBeGreaterThan(0);
    const target = items[0];

    await page.goto('/dropdowns');
    await listButtons(page).filter({ hasText: target.name }).first().click();
    await expect(page.getByText('Manage options. Changes are applied')).toBeVisible();

    await page.getByRole('button', { name: 'Edit name', exact: true }).click();
    const dialog = modal(page, 'Edit Dropdown Name');
    await expect(dialog).toBeVisible();
    await expect(await fieldIn(dialog, 'Dropdown Name')).toHaveValue(target.name);
    await expect(dialog.getByRole('button', { name: 'Save name', exact: true })).toBeVisible();

    await dialog.getByRole('button', { name: 'Close Edit Dropdown Name' }).click();
    await expectNoModal(page);
    expect(writes, `renaming must wait for Save: ${writes.join(', ')}`).toEqual([]);

    const after = await apiGet(request, '/dropdowns');
    expect(after.map((item) => item.name)).toEqual(items.map((item) => item.name));
  });

  test('the edit-option modal starts from the stored option and closes without writing', async ({
    page,
    request,
  }) => {
    const writes = watchWrites(page);
    const items = await apiGet(request, '/dropdowns');
    const withOptions = items.filter((item) => item.option_count > 0);
    expect(withOptions.length, 'no dropdown has an option to edit').toBeGreaterThan(0);
    const item = withOptions[0];
    const detail = await apiGet(request, `/dropdowns/${item.id}`);
    const option = detail.options[0];

    await page.goto('/dropdowns');
    await listButtons(page).filter({ hasText: item.name }).first().click();
    const rows = optionRows(page);
    await expect(rows).toHaveCount(detail.options.length);
    await rows.first().getByRole('button', { name: 'Edit', exact: true }).click();

    const dialog = modal(page, 'Edit Dropdown Option');
    await expect(dialog).toBeVisible();
    await expect(await fieldIn(dialog, 'Label')).toHaveValue(option.label);
    await expect(await fieldIn(dialog, 'Value')).toHaveValue(option.value);

    await dialog.getByRole('button', { name: 'Close Edit Dropdown Option' }).click();
    await expectNoModal(page);
    expect(writes, `editing an option must wait for Save: ${writes.join(', ')}`).toEqual([]);

    const reloaded = await apiGet(request, `/dropdowns/${item.id}`);
    expect(reloaded.options.map((o) => [o.label, o.value])).toEqual(
      detail.options.map((o) => [o.label, o.value]),
    );
  });
});
