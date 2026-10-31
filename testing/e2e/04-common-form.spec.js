import { test, expect } from '@playwright/test';
import { apiGet, cleanText, modal } from '../helpers/app.js';

test.describe('common form', () => {
  test('the editor lists exactly the fields the API returns, in order', async ({ page, request }) => {
    const fields = await apiGet(request, '/common-form');
    await page.goto('/common-form');
    await expect(page.getByRole('heading', { name: 'Common Form' })).toBeVisible();
    await expect(
      page.getByText('Fields selected here become available automatically when creating an asset of any type.'),
    ).toBeVisible();

    // One "Remove" button per selected field is the row count.
    await expect(page.getByRole('button', { name: 'Remove', exact: true })).toHaveCount(fields.length);
    const rowNames = await page
      .getByRole('button', { name: 'Remove', exact: true })
      .evaluateAll((buttons) =>
        buttons.map((button) => button.closest('div.flex.flex-wrap').querySelector('div.font-medium').textContent.trim()),
      );
    expect(rowNames).toEqual(fields.map((field) => field.name));
    await expect(page.getByRole('button', { name: 'Save common form' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Automations' })).toBeVisible();
  });

  test('each row shows the field name and the saved required / show-in-list flags', async ({ page, request }) => {
    const fields = await apiGet(request, '/common-form');
    await page.goto('/common-form');
    // Wait for React to render the rows before reading the DOM snapshot.
    await expect(page.getByRole('button', { name: 'Remove', exact: true })).toHaveCount(fields.length);
    const rows = await page.evaluate(() =>
      Array.from(document.querySelectorAll('main div.flex.flex-wrap'))
        .filter((row) =>
          Array.from(row.querySelectorAll(':scope > div button')).some(
            (button) => button.textContent.trim() === 'Remove',
          ),
        )
        .map((row) => ({
          name: row.querySelector(':scope > div div.font-medium')?.textContent.trim() ?? '',
          checkboxes: Array.from(row.querySelectorAll(':scope > label input[type="checkbox"]')).map(
            (input) => input.checked,
          ),
          listLabel:
            Array.from(row.querySelectorAll(':scope > label'))
              .map((label) => label.textContent.trim())
              .find((text) => text !== 'Required') ?? '',
        })),
    );
    expect(rows.length).toBe(fields.length);
    expect(rows.map((row) => row.name)).toEqual(fields.map((field) => field.name));
    rows.forEach((row, index) => {
      const field = fields[index];
      expect(row.checkboxes, `${field.name}: checkbox count`).toHaveLength(2);
      expect(row.checkboxes[0], `${field.name}: required flag`).toBe(Boolean(field.required));
      expect(row.listLabel, `${field.name}: quantity is never a list column`).toBe(
        field.type === 'quantity' ? 'Not a list column' : 'Show in Asset List',
      );
      if (field.type !== 'quantity') {
        expect(row.checkboxes[1], `${field.name}: show-in-list flag`).toBe(Boolean(field.showInList));
      }
    });
    await expect(page.getByRole('button', { name: 'Save common form' })).toBeVisible();
  });

  test('the add-field picker offers the fields that are not on the form yet', async ({ page, request }) => {
    const selectedFields = await apiGet(request, '/common-form');
    const allFields = await apiGet(request, '/fields');
    await page.goto('/common-form');
    const picker = page.locator('select').filter({ hasText: 'Add field to common form' });
    await expect(picker).toBeVisible();
    const options = await picker.locator('option').evaluateAll((els) =>
      els
        .map((el) => el.textContent.trim())
        .filter((text) => !text.startsWith('Add field to common form'))
        // Each real option reads "Name · type".
        .map((text) => text.split(' · ')[0]),
    );
    // The picker offers every field definition the viewer can see that is not
    // attached yet - by definition id, so another user's same-named field is a
    // separate option. /fields returns is_active as 1/0, so the client's
    // `is_active !== false` guard never filters anything (see BUG-LOG #3).
    const attachedIds = new Set(selectedFields.map((field) => field.id));
    const available = allFields.filter((field) => !attachedIds.has(field.id)).map((field) => field.name);
    expect(options.sort()).toEqual(available.sort());
  });

  test('automation rules render the stored conditions and actions', async ({ page, request }) => {
    const rules = await apiGet(request, '/common-form/automations');
    await page.goto('/common-form');
    const builder = page.getByRole('heading', { name: 'Automations' });
    await expect(builder).toBeVisible();
    if (!rules.length) {
      await expect(page.getByText(/no automation/i).first()).toBeVisible();
      return;
    }
    // The builder keeps one source/target control pair per stored rule.
    await expect(page.locator('select[data-automation-source], select').first()).toBeVisible();
    expect(rules.length).toBeGreaterThan(0);
  });

  test('the Copy to users modal loads its targets and closes without copying', async ({ page, request }) => {
    const targets = await apiGet(request, '/common-form/copy-targets');
    const writes = [];
    page.on('request', (req) => {
      if (req.method() !== 'GET' && req.url().includes('/api/v1/')) writes.push(`${req.method()} ${req.url()}`);
    });
    await page.goto('/common-form');
    await page.getByRole('button', { name: 'Copy to users' }).click();
    const dialog = modal(page, /Copy/);
    await expect(dialog).toBeVisible();
    for (const target of targets) {
      await expect(dialog.locator('*').filter({ hasText: target.displayName || target.email }).first()).toBeVisible();
    }
    await dialog.locator('button[aria-label^="Close"]').click();
    await expect(dialog).toHaveCount(0);
    expect(writes, `opening the copy modal must not copy anything: ${writes.join(', ')}`).toEqual([]);
  });
});
