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

// Mirrors the `types` list in client/src/pages/Fields.jsx. Keeping it here means a
// label change in either place fails a test instead of silently renaming a type.
const TYPE_LABELS = {
  text: 'Short Text',
  multiline: 'Multiline Text',
  mobile: 'Mobile Number',
  number: 'Number',
  quantity: 'Quantity (1-15)',
  boolean: 'Yes / No',
  date: 'Date',
  auto_date: 'Current Date (Editable)',
  dropdown: 'Dropdown',
};

test.describe('field definitions', () => {
  test('the table columns match the API rows, in order', async ({ page, request }) => {
    const fields = await apiGet(request, '/fields');
    await page.goto('/fields');
    await expect(page.getByRole('heading', { name: 'Field Definitions' })).toBeVisible();
    await expect(
      page.getByText("Every user's fields are listed here", { exact: false }),
    ).toBeVisible();

    // textContent, not innerText: the table headers are rendered uppercase by CSS
    // (text-transform) while the markup still says "Name".
    const headerTexts = await page
      .locator('main table thead th')
      .evaluateAll((els) => els.map((el) => el.textContent.trim()));
    expect(headerTexts).toEqual(['Name', 'Key', 'Type', 'Owner', 'Source', '']);

    const rows = page.locator('main table tbody tr');
    await expect(rows).toHaveCount(fields.length);
    const names = await columnTexts(rows, 0);
    const keys = await columnTexts(rows, 1);
    const types = await columnTexts(rows, 2);
    const sources = await columnTexts(rows, 4);

    expect(names).toEqual(fields.map((field) => field.name));
    expect(keys).toEqual(fields.map((field) => field.field_key));
    expect(types).toEqual(
      fields.map((field) => {
        const label = TYPE_LABELS[field.type];
        expect(label, `no UI label for field type "${field.type}"`).toBeTruthy();
        return label;
      }),
    );
    expect(sources).toEqual(fields.map((field) => cleanText(field.dropdown_name || '—')));
  });

  test('the Owner column shows who owns every field', async ({ page, request }) => {
    const [fields, me] = await Promise.all([
      apiGet(request, '/fields'),
      apiGet(request, '/auth/me'),
    ]);
    await page.goto('/fields');
    const rows = page.locator('main table tbody tr');
    await expect(rows).toHaveCount(fields.length);
    const owners = await columnTexts(rows, 3);

    fields.forEach((field, index) => {
      const name = (field.owner_display_name || '').trim() || field.owner_email || 'Unknown';
      expect(owners[index], `row ${index} owner cell`).toContain(name);
      if (Number(field.owner_user_id) === Number(me.user.id)) {
        expect(owners[index]).toContain('You');
      } else if (field.owner_role === 'admin') {
        expect(owners[index]).toContain('Admin');
      }
      if (field.owner_display_name) expect(owners[index]).toContain(field.owner_email);
    });
  });

  test('the create-field modal offers every type and closes without writing', async ({
    page,
    request,
  }) => {
    const writes = watchWrites(page);
    const dropdowns = await apiGet(request, '/dropdowns');
    await page.goto('/fields');

    await page.getByRole('button', { name: '+ Add Field', exact: true }).click();
    const dialog = modal(page, 'Create Field');
    await expect(dialog).toBeVisible();
    await expectLabels(dialog, [
      'Field Name',
      'Internal Key',
      'Field Type',
    ]);

    const typeSelect = await fieldIn(dialog, 'Field Type');
    const options = await typeSelect
      .locator('option')
      .evaluateAll((els) => els.map((el) => el.innerText.trim()));
    expect(options).toEqual(['Select...', ...Object.values(TYPE_LABELS)]);
    expect(await typeSelect.inputValue()).toBe('text');

    // Choosing "dropdown" reveals the source picker, listing every dropdown.
    await typeSelect.selectOption('dropdown');
    await expectLabels(dialog, [
      'Field Name',
      'Internal Key',
      'Field Type',
      'Dropdown Source',
    ]);
    const sourceSelect = await fieldIn(dialog, 'Dropdown Source');
    const sourceNames = await sourceSelect
      .locator('option')
      .evaluateAll((els) => els.map((el) => el.innerText.trim()));
    expect(sourceNames).toEqual(['Select...', ...dropdowns.map((d) => d.name)]);

    await typeSelect.selectOption('text');
    await expectLabels(dialog, [
      'Field Name',
      'Internal Key',
      'Field Type',
    ]);

    await dialog.getByRole('button', { name: 'Close Create Field' }).click();
    await expectNoModal(page);
    expect(writes, `opening the modal must not write: ${writes.join(', ')}`).toEqual([]);
  });

  test('the edit-field modal is prefilled from its row and closes without writing', async ({
    page,
    request,
  }) => {
    const writes = watchWrites(page);
    const fields = await apiGet(request, '/fields');
    const target = fields.find((field) => field.type === 'dropdown') ?? fields[0];
    const index = fields.indexOf(target);

    await page.goto('/fields');
    const rows = page.locator('main table tbody tr');
    await expect(rows).toHaveCount(fields.length);
    await rows.nth(index).getByRole('button', { name: 'Edit', exact: true }).click();

    const dialog = modal(page, 'Edit Field');
    await expect(dialog).toBeVisible();
    await expect(await fieldIn(dialog, 'Field Name')).toHaveValue(target.name);
    await expect(await fieldIn(dialog, 'Internal Key')).toHaveValue(target.field_key);
    await expect(await fieldIn(dialog, 'Field Type')).toHaveValue(target.type);
    if (target.type === 'dropdown') {
      await expect(await fieldIn(dialog, 'Dropdown Source')).toHaveValue(String(target.dropdown_id));
    }
    await expect(
      dialog.getByRole('button', { name: 'Save changes', exact: true }),
    ).toBeVisible();

    await dialog.getByRole('button', { name: 'Close Edit Field' }).click();
    await expectNoModal(page);
    expect(writes, `editing must not write until saved: ${writes.join(', ')}`).toEqual([]);

    // The table is untouched by the open/close round trip.
    const after = page.locator('main table tbody tr');
    await expect(after).toHaveCount(fields.length);
    expect(cleanText(await after.nth(index).locator('td').first().innerText())).toBe(target.name);
  });
});
