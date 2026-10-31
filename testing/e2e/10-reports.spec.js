import { test, expect } from '@playwright/test';
import {
  apiGet,
  cleanText,
  columnTexts,
  expectChecked,
  expectLabels,
  expectNoModal,
  modal,
  watchWrites,
} from '../helpers/app.js';

// Reports assembles one big client-side table: it GETs /asset-types, then for
// every type the form (its columns) and every page of its assets (its rows).
// Nothing is filtered or ordered by the server, so a type with an inactive field
// still gets that column. All expectations below are recomputed from the same
// live endpoints - the test follows production data instead of hard-coding it.
async function allAssets(request, typeId) {
  const first = await apiGet(request, `/asset-types/${typeId}/assets?page=1&pageSize=100`);
  const items = [...first.items];
  for (let page = 2; page <= Math.ceil(first.total / first.pageSize); page += 1) {
    items.push(...(await apiGet(request, `/asset-types/${typeId}/assets?page=${page}&pageSize=100`)).items);
  }
  return items;
}

async function reportModel(request) {
  const types = await apiGet(request, '/asset-types');
  const columns = [{ key: 'assetType', label: 'Asset Type' }];
  const rows = [];
  for (const type of types) {
    for (const field of await apiGet(request, `/asset-types/${type.id}/form`)) {
      if (!columns.some((column) => column.key === field.field_key)) {
        columns.push({ key: field.field_key, label: field.name });
      }
    }
    for (const asset of await allAssets(request, type.id)) {
      rows.push({ publicId: asset.publicId, assetTypeName: type.name });
    }
  }
  return { columns, rows };
}

// The header button holds "<label> <sort marker><filter dot>"; cleanText removes
// ↑ ↓ ● but not the neutral ↕, so strip it here.
function headerText(scope) {
  return scope
    .locator('thead th')
    .evaluateAll((ths) => ths.map((th) => th.querySelector('button')?.textContent ?? ''))
    .then((list) => list.map((text) => cleanText(text).replace(/[↕]/g, '').trim()).filter(Boolean));
}

const rowsIn = (page) => page.locator('main tbody tr');
const summary = (page) => page.locator('main span').filter({ hasText: /^Showing \d+ of \d+ assets/ }).first();
const popover = (page) => page.locator('div[class*="z-[55]"]');

async function open(page, request) {
  const writes = watchWrites(page);
  const model = await reportModel(request);
  await page.goto('/reports');
  await expect(page.getByRole('heading', { name: 'Reports', exact: true })).toBeVisible();
  await expect(page.getByText('Loading report...')).toHaveCount(0);
  await expect(page.getByText('View and analyze assets across every asset type.')).toBeVisible();
  // Wait for the assembled table before reading it: headerText()/columnTexts()
  // take a single snapshot, and the SPA is still rendering right after goto().
  await expect(summary(page)).toBeVisible();
  return { model, writes };
}

test.describe('reports', () => {
  test('the table is every type column and every asset the API returns', async ({ page, request }) => {
    const { model, writes } = await open(page, request);
    expect(
      model.rows.length,
      'this suite needs at least one asset in the database',
    ).toBeGreaterThan(0);

    expect(await headerText(page.locator('main'))).toEqual(
      model.columns.map((column) => column.label),
    );

    await expect(summary(page)).toHaveText(`Showing ${model.rows.length} of ${model.rows.length} assets`);
    await expect(rowsIn(page)).toHaveCount(model.rows.length);

    // Order-independent: the same set of assets must be on screen.
    const hrefs = await rowsIn(page).locator('td:last-child a').evaluateAll((els) =>
      els.map((el) => el.getAttribute('href')),
    );
    expect([...hrefs].sort()).toEqual(model.rows.map((row) => `/assets/${row.publicId}`).sort());

    const typeNames = await columnTexts(rowsIn(page), 0);
    const countBy = (list) => list.reduce((acc, name) => ({ ...acc, [name]: (acc[name] || 0) + 1 }), {});
    expect(countBy(typeNames)).toEqual(countBy(model.rows.map((row) => row.assetTypeName)));

    // Each type name links to that type page, not to an asset.
    const types = await apiGet(request, '/asset-types');
    const hrefByName = Object.fromEntries(types.map((type) => [type.name, `/asset-types/${type.id}`]));
    const typeHrefs = await rowsIn(page).locator('td:first-child a').evaluateAll((els) =>
      els.map((el) => el.getAttribute('href')),
    );
    expect(typeHrefs).toEqual(typeNames.map((name) => hrefByName[name]));

    expect(writes, `opening Reports must not write: ${writes.join(', ')}`).toEqual([]);
  });

  test('sorting and the type link are client-side', async ({ page, request }) => {
    const { model, writes } = await open(page, request);
    const asc = await columnTexts(rowsIn(page), 0);
    const header = page.locator('main thead th').first().locator('button').first();

    await header.click();
    await expect(header).toContainText('↓');
    const desc = await columnTexts(rowsIn(page), 0);
    expect(desc).toEqual(
      [...asc].sort((a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' })),
    );

    await header.click();
    await expect(header).toContainText('↑');
    expect(await columnTexts(rowsIn(page), 0)).toEqual(asc);

    // Following the first row's Asset Type link lands on that type page.
    const firstTypeName = asc[0];
    const expectedType = (await apiGet(request, '/asset-types')).find((type) => type.name === firstTypeName);
    await rowsIn(page).locator('td:first-child a').first().click();
    await expect(page).toHaveURL(new RegExp(`/asset-types/${expectedType.id}$`));
    await expect(page.getByRole('heading', { name: expectedType.name, exact: true })).toBeVisible();

    await page.goBack();
    await expect(summary(page)).toHaveText(`Showing ${model.rows.length} of ${model.rows.length} assets`);
    expect(writes, `sorting, navigating and going back must not write: ${writes.join(', ')}`).toEqual([]);
  });

  test('the column filter lists the live values and filters without a request', async ({ page, request }) => {
    const { model, writes } = await open(page, request);
    const expected = [...new Set(model.rows.map((row) => row.assetTypeName))].sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true }),
    );

    await page.locator('main thead th').first().locator('button').nth(1).click();
    const pop = popover(page);
    await expect(pop).toHaveCount(1);
    const search = pop.getByPlaceholder('Search Asset Type');
    await expect(search).toBeVisible();
    await expect(pop.locator('label span.truncate')).toHaveText(expected);

    await search.fill('zzz-no-such-value');
    await expect(pop.getByText('No matching values')).toBeVisible();
    await expect(pop.locator('label')).toHaveCount(0);
    await search.fill('');

    await pop.getByRole('button', { name: 'Select visible', exact: true }).click();
    await expectChecked(pop.locator('label input'), expected.map(() => true));
    await pop.getByRole('button', { name: 'Clear all', exact: true }).click();
    await expectChecked(pop.locator('label input'), expected.map(() => false));

    const single = expected[expected.length - 1];
    await pop.getByLabel(single, { exact: true }).check();
    await page.keyboard.press('Escape');
    await expect(pop).toHaveCount(0);

    const expectedCount = model.rows.filter((row) => row.assetTypeName === single).length;
    await expect(summary(page)).toHaveText(`Showing ${expectedCount} of ${model.rows.length} assets`);
    expect(await columnTexts(rowsIn(page), 0)).toEqual(Array(expectedCount).fill(single));
    await expect(page.getByRole('button', { name: 'Clear filters', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
    await expect(summary(page)).toHaveText(`Showing ${model.rows.length} of ${model.rows.length} assets`);
    expect(writes, `filtering a report column must not write: ${writes.join(', ')}`).toEqual([]);
  });

  test('the search box matches the visible columns and can be cleared', async ({ page, request }) => {
    const { model, writes } = await open(page, request);
    const labels = await headerText(page.locator('main'));

    // A search matches ANY visible column, so first hide every column but Asset
    // Type - that makes the expected row count exact instead of incidental.
    await page.getByRole('button', { name: 'Customize Columns', exact: true }).click();
    const dialog = modal(page, 'Customize Report Columns');
    const boxes = dialog.locator('label input[type="checkbox"]');
    for (let index = 1; index < labels.length; index += 1) {
      await boxes.nth(index).uncheck();
    }
    await dialog.getByRole('button', { name: 'Done', exact: true }).click();
    await expectNoModal(page);
    expect(await headerText(page.locator('main'))).toEqual(['Asset Type']);

    const search = page.getByPlaceholder('Search any column...');
    const single = model.rows[0].assetTypeName;
    const expectedCount = model.rows.filter((row) => row.assetTypeName === single).length;
    await search.fill(single);
    await expect(summary(page)).toHaveText(
      `Showing ${expectedCount} of ${model.rows.length} assets matching "${single}"`,
    );
    expect(await columnTexts(rowsIn(page), 0)).toEqual(Array(expectedCount).fill(single));

    await search.fill('zzz-no-such-asset');
    await expect(summary(page)).toHaveText(`Showing 0 of ${model.rows.length} assets matching "zzz-no-such-asset"`);
    await expect(rowsIn(page)).toHaveCount(1);
    await expect(page.getByText('No assets match this search or these filters.')).toBeVisible();

    await search.fill('');
    await expect(summary(page)).toHaveText(`Showing ${model.rows.length} of ${model.rows.length} assets`);
    await expect(rowsIn(page)).toHaveCount(model.rows.length);

    // Put the columns back, so the rest of the suite sees the default table.
    await page.getByRole('button', { name: 'Customize Columns', exact: true }).click();
    for (let index = 1; index < labels.length; index += 1) {
      await boxes.nth(index).check();
    }
    await dialog.getByRole('button', { name: 'Done', exact: true }).click();
    await expectNoModal(page);
    expect(await headerText(page.locator('main'))).toEqual(labels);
    expect(writes, `searching and customising must not write: ${writes.join(', ')}`).toEqual([]);
  });

  test('Customize Columns hides a column and the Asset Type column is locked', async ({ page, request }) => {
    const { model, writes } = await open(page, request);
    const labels = await headerText(page.locator('main'));
    expect(labels).toEqual(model.columns.map((column) => column.label));

    await page.getByRole('button', { name: 'Customize Columns', exact: true }).click();
    const dialog = modal(page, 'Customize Report Columns');
    await expectLabels(dialog, labels);
    // Column names are not guaranteed unique (two fields can share a display
    // name), so work by position: the list order is the column order.
    const boxes = dialog.locator('label input[type="checkbox"]');
    await expect(boxes).toHaveCount(labels.length);
    await expect(boxes.nth(0)).toBeChecked();
    await expect(boxes.nth(0)).toBeDisabled();
    await expect(dialog.getByText('Required')).toBeVisible();

    await boxes.nth(1).uncheck();
    await expect(boxes.nth(1)).not.toBeChecked();
    await dialog.getByRole('button', { name: 'Done', exact: true }).click();
    await expectNoModal(page);

    expect(await headerText(page.locator('main'))).toEqual(labels.filter((_, index) => index !== 1));

    await page.getByRole('button', { name: 'Customize Columns', exact: true }).click();
    await boxes.nth(1).check();
    await dialog.getByRole('button', { name: 'Done', exact: true }).click();
    await expectNoModal(page);
    expect(await headerText(page.locator('main'))).toEqual(labels);
    expect(writes, `customising columns must not write: ${writes.join(', ')}`).toEqual([]);
  });

  test('Export XLSX downloads the visible table and touches no API', async ({ page, request }) => {
    const { model, writes } = await open(page, request);
    const me = await apiGet(request, '/auth/me');
    const canExport = me.user.role === 'admin' || (me.user.permissions || []).includes('reports.export_own');
    const button = page.getByRole('button', { name: 'Export XLSX', exact: true });

    if (!canExport) {
      await expect(button).toHaveCount(0);
      return;
    }
    await expect(button).toBeEnabled();

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30000 }),
      button.click(),
    ]);
    expect(download.suggestedFilename()).toBe('asset-report.xlsx');
    expect(writes, `exporting must not write: ${writes.join(', ')}`).toEqual([]);
    expect(model.rows.length).toBeGreaterThan(0);
  });
});
