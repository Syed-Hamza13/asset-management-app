import { test, expect } from '@playwright/test';
import { apiGet, controlLabels, modal } from '../helpers/app.js';

// Read-only by design: the suite opens every create/edit surface but never
// submits, so the live production database is not touched.
test.describe('dashboard', () => {
  test('asset type cards match the API, names and counts', async ({ page, request }) => {
    const types = await apiGet(request, '/asset-types');
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Assets' })).toBeVisible();
    const cards = page.locator('main a[href^="/asset-types/"]');
    await expect(cards).toHaveCount(types.length);
    for (const type of types) {
      const card = page.locator('a', { hasText: type.name }).first();
      await expect(card).toContainText(type.name);
      await expect(card).toContainText(
        `${type.asset_count} asset${Number(type.asset_count) === 1 ? '' : 's'}`,
      );
    }
  });

  test('the type search narrows the grid and reports the match count', async ({ page, request }) => {
    const types = await apiGet(request, '/asset-types');
    expect(types.length, 'needs more than one asset type to test filtering').toBeGreaterThan(1);
    const target = types[0].name;
    const needle = target.slice(0, 3).toLowerCase();
    const expectedMatches = types.filter((t) => t.name.toLowerCase().includes(needle)).length;
    await page.goto('/');
    const search = page.getByLabel('Search asset types');
    await search.fill(target.slice(0, 3));
    await expect(page.getByText(`${expectedMatches} of ${types.length} asset types`)).toBeVisible();
    await expect(page.locator('main a[href^="/asset-types/"]')).toHaveCount(expectedMatches);

    await search.fill('zzz-no-such-type');
    await expect(page.getByText('No asset type matches')).toBeVisible();
    await page.getByText('Clear search', { exact: true }).click();
    await expect(search).toHaveValue('');
    await expect(page.locator('main a[href^="/asset-types/"]')).toHaveCount(types.length);
  });

  test('the Add Asset modal shows the type form exactly as the API defines it, and cancels without writing', async ({
    page,
    request,
  }) => {
    const types = await apiGet(request, '/asset-types');
    const withFields = [];
    for (const type of types.slice(0, 6)) {
      const form = await apiGet(request, `/asset-types/${type.id}/assets/form`);
      if (form.fields.length) {
        withFields.push({ type, form });
        if (withFields.length >= 3) break;
      }
    }
    expect(withFields.length).toBeGreaterThan(0);

    const writes = [];
    page.on('request', (req) => {
      if (req.method() !== 'GET' && req.url().includes('/api/v1/')) writes.push(`${req.method()} ${req.url()}`);
    });

    for (const { type, form } of withFields) {
      await page.goto('/');
      await page.getByRole('button', { name: '+ Add Asset', exact: true }).click();
      const dialog = modal(page, 'Add Asset');
      await expect(dialog).toBeVisible();
      await dialog.getByLabel('Asset Type').fill(type.name);
      await dialog.getByRole('button', { name: type.name, exact: true }).click();
      await expect(dialog).toContainText(`Adding a new ${type.name} asset`);

      // The modal's own "Asset Type" picker sits above the dynamic fields, and
      // the fields arrive a moment later ("Loading fields..."), so poll until the
      // API's field list is on screen.
      const expected = form.fields.map((field) => field.name);
      const labelsWithoutPicker = () =>
        controlLabels(dialog).then((all) => all.filter((label) => label !== 'Asset Type'));
      await expect
        .poll(labelsWithoutPicker, { timeout: 15_000, message: `${type.name}: fields never rendered` })
        .toEqual(expected);
      const labels = await labelsWithoutPicker();
      expect(new Set(labels).size, `duplicate field labels in ${type.name}`).toBe(labels.length);
      await expect(dialog.getByRole('button', { name: `Save ${type.name}` })).toBeVisible();

      await dialog.getByRole('button', { name: 'Cancel' }).click();
      await expect(dialog).toHaveCount(0);
    }
    expect(writes, `cancelling must not send a write: ${writes.join(', ')}`).toEqual([]);
  });

  test('the Add Asset Type modal opens and cancels without creating a type', async ({ page, request }) => {
    const before = await apiGet(request, '/asset-types');
    const writes = [];
    page.on('request', (req) => {
      if (req.method() !== 'GET' && req.url().includes('/api/v1/')) writes.push(`${req.method()} ${req.url()}`);
    });
    await page.goto('/');
    await page.getByRole('button', { name: '+ Add Asset Type' }).click();
    const dialog = modal(page, 'Create Asset Type');
    await expect(dialog.getByLabel('Asset Type Name')).toBeVisible();
    await dialog.getByRole('button', { name: 'Close Create Asset Type' }).click();
    await expect(dialog).toHaveCount(0);
    expect(writes).toEqual([]);
    const after = await apiGet(request, '/asset-types');
    expect(after.length).toBe(before.length);
  });
});
