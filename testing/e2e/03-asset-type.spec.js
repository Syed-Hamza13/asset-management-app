import { test, expect } from '@playwright/test';
import { apiGet, cleanText, controlLabels, modal, textOf, asDisplayDate } from '../helpers/app.js';

// Picks a handful of types that actually have rows, so the table and the
// in-row edit overlay have something to assert against.
async function typesWithAssets(request, want) {
  const types = await apiGet(request, '/asset-types');
  const picked = [];
  for (const type of types) {
    const assets = await apiGet(request, `/asset-types/${type.id}/assets?page=1`);
    if (!assets.items?.length) continue;
    const form = await apiGet(request, `/asset-types/${type.id}/form`);
    picked.push({ type, assets, form });
    if (picked.length >= want) break;
  }
  return picked;
}

test.describe('asset type page', () => {
  test('header, admin toolbar and list columns match the API', async ({ page, request }) => {
    const [first] = await typesWithAssets(request, 1);
    expect(first, 'no asset type has assets to list').toBeTruthy();

    await page.goto(`/asset-types/${first.type.id}`);
    await expect(page.getByRole('heading', { name: first.type.name, exact: true }).first()).toBeVisible();
    await expect(page.getByText('Click an asset to view or edit it.')).toBeVisible();
    for (const label of ['Columns', 'Share', 'Rename', 'Delete']) {
      await expect(page.getByRole('button', { name: label, exact: true })).toBeVisible();
    }

    const listed = first.form.filter((field) => field.showInList).map((field) => field.name);
    const headers = await textOf(page.locator('main table thead th'));
    expect(headers).toEqual(listed);
    expect(new Set(headers).size, 'duplicate column headers').toBe(headers.length);

    await expect(page.locator('main table tbody tr')).toHaveCount(first.assets.items.length);
  });

  test('the in-row edit overlay keeps saved values, including a saved auto_date', async ({ page, request }) => {
    const [first] = await typesWithAssets(request, 1);
    const asset = first.assets.items[0];
    const detail = await apiGet(request, `/assets/${asset.publicId}`);

    const writes = [];
    page.on('request', (req) => {
      if (req.method() !== 'GET' && req.url().includes('/api/v1/')) writes.push(`${req.method()} ${req.url()}`);
    });

    await page.goto(`/asset-types/${first.type.id}`);
    await page.locator('main table tbody tr').first().getByRole('button', { name: 'Edit', exact: true }).click();
    const dialog = modal(page, new RegExp(`^Edit ${first.type.name}`));
    await expect(dialog).toBeVisible();

    // Editing excludes quantity fields by design; every other field must appear.
    const expected = first.form
      .filter((field) => field.type !== 'quantity')
      .map((field) => field.name);
    await expect
      .poll(() => controlLabels(dialog), { timeout: 15_000, message: 'edit overlay fields never rendered' })
      .toEqual(expected);

    const stored = detail.values || {};
    const autoDates = first.form.filter((field) => field.type === 'auto_date');
    for (const field of autoDates) {
      // /asset-types/:id/form speaks in snake_case rows, so the value key is field_key.
      const key = field.field_key || field.key;
      const label = dialog.locator('label').filter({ hasText: field.name }).first();
      const shown = cleanText(await label.locator('input').first().inputValue());
      const saved = stored[key];
      if (saved) {
        expect(shown, `${field.name} must show the stored date`).toBe(asDisplayDate(saved));
      } else {
        // A date the user deliberately cleared stays cleared on edit.
        expect(shown, `${field.name} was saved empty but the overlay prefilled it`).toBe('');
      }
    }

    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);
    expect(writes, `cancelling an edit must not send a write: ${writes.join(', ')}`).toEqual([]);
  });

  test('the asset detail page renders the stored values', async ({ page, request }) => {
    const [first] = await typesWithAssets(request, 1);
    const asset = first.assets.items[0];
    const detail = await apiGet(request, `/assets/${asset.publicId}`);

    await page.goto(`/assets/${asset.publicId}`);
    await expect(page.getByRole('heading', { name: first.type.name, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
    await expect(page.locator('main')).toContainText(first.type.name);

    // The detail page loads its values a moment after the shell renders, so every
    // value check must be a retrying assertion rather than a one-off innerText read.
    for (const field of first.form) {
      if (field.type === 'dropdown' || field.type === 'text' || field.type === 'multiline') {
        const value = detail.values?.[field.field_key || field.key];
        const needle = cleanText(String(value ?? '').split('\n')[0]).slice(0, 40);
        if (!needle) continue;
        await expect(
          page.locator('main'),
          `${field.name}: stored value missing from the detail page`,
        ).toContainText(needle, { ignoreCase: true, timeout: 15_000 });
      }
    }
  });

  test('share, rename and delete modals open and close without changing anything', async ({ page, request }) => {
    const [first] = await typesWithAssets(request, 1);
    const before = await apiGet(request, '/asset-types');
    const writes = [];
    page.on('request', (req) => {
      if (req.method() !== 'GET' && req.url().includes('/api/v1/')) writes.push(`${req.method()} ${req.url()}`);
    });

    await page.goto(`/asset-types/${first.type.id}`);
    await page.getByRole('button', { name: 'Share', exact: true }).click();
    const share = modal(page, /Share/);
    await expect(share).toBeVisible();
    await share.locator('button[aria-label^="Close"]').click();
    await expect(share).toHaveCount(0);

    await page.getByRole('button', { name: 'Rename', exact: true }).click();
    const rename = modal(page, /Rename/);
    await expect(rename.locator('input').first()).toBeVisible();
    await rename.locator('button[aria-label^="Close"]').click();
    await expect(rename).toHaveCount(0);

    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    const del = modal(page, /Delete/);
    await expect(del).toBeVisible();
    await del.locator('button[aria-label^="Close"]').click();
    await expect(del).toHaveCount(0);

    expect(writes, `opening these modals must be read-only: ${writes.join(', ')}`).toEqual([]);
    const after = await apiGet(request, '/asset-types');
    expect(after.length).toBe(before.length);
  });
});
