import { test, expect } from '@playwright/test';
import {
  apiGet,
  asDisplayDate,
  controlLabels,
  modal,
  todayIST,
  watchWrites,
} from '../helpers/app.js';
import { applyAutomationRules } from '../../shared/automationRules.js';
import { readBaseline } from '../helpers/contract.js';

// The create/edit forms are the heart of the app: the field list, the seeding and
// the automation pass all come from the dynamic engine. These tests walk EVERY
// asset type and compare the rendered form against /asset-types/:id/assets/form,
// using the very algorithm the client runs (shared/automationRules.js).
async function readForm(request, typeId) {
  const form = await apiGet(request, `/asset-types/${typeId}/assets/form`);
  const withOptions = await Promise.all(
    form.fields.map(async (field) => {
      if (field.type !== 'dropdown' || !field.dropdownId) return field;
      const dropdown = await apiGet(request, `/dropdowns/${field.dropdownId}`);
      return { ...field, activeOptions: dropdown.options.filter((o) => o.is_active) };
    }),
  );
  return { fields: withOptions, automations: form.automations || [] };
}

// Exactly DynamicForm's first pass for a create form: seed auto_date with today,
// then run the owner's rules over the seeded object.
function createDefaults(fields, automations) {
  const seeded = {};
  for (const field of fields) if (field.type === 'auto_date') seeded[field.key] = todayIST();
  return applyAutomationRules(automations, seeded, {});
}

const clampQuantity = (value) => Math.min(15, Math.max(1, Number(value || 1)));

/** The value the browser shows for one field, in the widget's own format. */
function expectedDisplay(field, value) {
  if (field.type === 'date' || field.type === 'auto_date') return asDisplayDate(value ? String(value).slice(0, 10) : '');
  if (field.type === 'quantity') return String(clampQuantity(value));
  if (field.type === 'boolean') return value === undefined || value === null || value === '' ? '' : String(value);
  if (field.type === 'dropdown') {
    const allowed = (field.activeOptions || []).map((option) => String(option.value));
    return allowed.includes(String(value ?? '')) ? String(value) : '';
  }
  return value === undefined || value === null ? '' : String(value);
}

async function fieldControl(label, field) {
  if (field.type === 'date' || field.type === 'auto_date') return label.locator('input').first();
  if (field.type === 'quantity') return label.locator('span').nth(1);
  if (field.type === 'dropdown' || field.type === 'boolean') return label.locator('select');
  return label.locator('input, textarea').first();
}

// The quantity widget shows its number in a <span>, everything else in a control.
async function expectFieldDisplay(label, field, value, message) {
  const control = await fieldControl(label, field);
  if (field.type === 'quantity') return expect(control, message).toHaveText(value);
  return expect(control, message).toHaveValue(value);
}

async function openCreate(page, request, type) {
  const writes = watchWrites(page);
  const { fields, automations } = await readForm(request, type.id);
  await page.goto(`/asset-types/${type.id}/new`);
  await expect(page.getByRole('heading', { name: `Add ${type.name}`, exact: true })).toBeVisible();
  await expect(page.getByText('Fill the configured fields below.', { exact: true })).toBeVisible();
  await expect(page.getByText('Loading form...')).toHaveCount(0);
  return { writes, fields, automations, labels: page.locator('main form label') };
}

test.describe('dynamic form engine', () => {
  test('every asset type opens its create form with the right fields, labels and defaults', async ({
    page,
    request,
  }) => {
    const types = await apiGet(request, '/asset-types');
    expect(types.length, 'no asset types exist').toBeGreaterThan(0);

    for (const type of types) {
      const { writes, fields, automations, labels } = await openCreate(page, request, type);
      const defaults = createDefaults(fields, automations);

      await expect(labels).toHaveCount(fields.length);
      expect(await controlLabels(page.locator('main form'))).toEqual(fields.map((field) => field.name));

      for (const [index, field] of fields.entries()) {
        const label = labels.nth(index);
        // Only the quantity widget omits the required marker (its value can never
        // be empty: the stepper clamps to 1..15).
        const marker = field.required && field.type !== 'quantity' ? ' *' : '';
        await expect(label.locator('span').first()).toHaveText(`${field.name}${marker}`);
        await expectFieldDisplay(
          label,
          field,
          expectedDisplay(field, defaults[field.key]),
          `${type.name} / ${field.name} (${field.type}) default`,
        );
      }
      expect(writes, `opening the ${type.name} create form must not write: ${writes.join(', ')}`).toEqual([]);
    }
  });

  test('every field type renders its own widget', async ({ page, request }) => {
    const types = await apiGet(request, '/asset-types');
    const seen = new Set();

    for (const type of types) {
      const { writes, fields, labels } = await openCreate(page, request, type);
      for (const [index, field] of fields.entries()) {
        const label = labels.nth(index);
        seen.add(field.type);
        if (field.type === 'multiline') {
          await expect(label.locator('textarea')).toHaveCount(1);
          await expect(label.locator('input')).toHaveCount(0);
        }
        if (field.type === 'mobile') {
          const control = label.locator('input');
          await expect(control).toHaveAttribute('type', 'tel');
          await expect(control).toHaveAttribute('inputmode', 'tel');
          await expect(control).toHaveAttribute('placeholder', 'e.g. 9876543210');
        }
        if (field.type === 'number') {
          await expect(label.locator('input')).toHaveAttribute('type', 'number');
        }
        if (field.type === 'date' || field.type === 'auto_date') {
          // A visible DD/MM/YYYY box plus the hidden native picker it mirrors.
          const texts = label.locator('input');
          await expect(texts).toHaveCount(2);
          await expect(texts.first()).toHaveAttribute('placeholder', 'DD/MM/YYYY');
          await expect(label.locator('button[aria-label="Open calendar"]')).toHaveCount(1);
        }
        if (field.type === 'dropdown') {
          const optionText = await label.locator('option').evaluateAll((els) =>
            els.map((el) => `${el.value}|${el.textContent}`),
          );
          expect(optionText, `${field.name} options`).toEqual([
            '|Select...',
            ...(field.activeOptions || []).map((option) => `${option.value}|${option.label}`),
          ]);
        }
        if (field.type === 'quantity') {
          await expect(label.locator('button')).toHaveCount(2);
          await expect(label.locator('input')).toHaveCount(0);
        }
      }
      expect(writes, `inspecting widgets must not write: ${writes.join(', ')}`).toEqual([]);
    }

    // The widgets that must be covered are the ones the stored forms actually use
    // (per the captured contract), and each must be one Fields.jsx offers.
    const SUPPORTED = ['auto_date', 'boolean', 'date', 'dropdown', 'mobile', 'multiline', 'number', 'quantity', 'text'];
    const inUse = new Set(
      Object.values(readBaseline().types).flatMap((entry) => (entry.form || []).map((column) => column.split(':')[2])),
    );
    expect([...seen].sort(), 'a create form failed to render a stored field type').toEqual([...inUse].sort());
    for (const type of seen) {
      expect(SUPPORTED, `a stored form uses "${type}", which Fields.jsx does not offer`).toContain(type);
    }
    const unused = SUPPORTED.filter((type) => !inUse.has(type));
    if (unused.length) {
      test
        .info()
        .annotations.push({
          type: 'coverage-gap',
          description: `${unused.join(', ')}: offered by Fields.jsx but no stored field uses it, so this read-only suite cannot render it (see BUG-LOG).`,
        });
    }
  });

  test('the quantity stepper is bounded 1..15 and stays client-side', async ({ page, request }) => {
    const types = await apiGet(request, '/asset-types');
    let picked = null;
    for (const type of types) {
      const { fields } = await readForm(request, type.id);
      const index = fields.findIndex((field) => field.type === 'quantity');
      if (index >= 0) {
        picked = { type, index };
        break;
      }
    }
    test.skip(!picked, 'no asset type has a quantity field');

    const { writes, labels } = await openCreate(page, request, picked.type);
    const stepper = labels.nth(picked.index);
    const minus = stepper.locator('button').first();
    const plus = stepper.locator('button').last();
    const count = stepper.locator('span').nth(1);

    await expect(count).toHaveText('1');
    await expect(minus).toBeDisabled();
    await expect(plus).toBeEnabled();

    await plus.click();
    await plus.click();
    await expect(count).toHaveText('3');
    await minus.click();
    await expect(count).toHaveText('2');
    await minus.click();
    await expect(count).toHaveText('1');
    await expect(minus).toBeDisabled();

    for (let step = 0; step < 20 && (await plus.isEnabled()); step += 1) await plus.click();
    await expect(count).toHaveText('15');
    await expect(plus).toBeDisabled();

    expect(writes, `using the stepper must not write: ${writes.join(', ')}`).toEqual([]);
  });

  /** A value the person could choose that differs from what the rule wrote, plus
   * how the widget must then display it. */
  function alternative(field, current) {
    if (field.type === 'dropdown') {
      const other = (field.activeOptions || []).map((o) => String(o.value)).find((v) => v !== String(current));
      return other ? { input: other, display: other } : null;
    }
    if (field.type === 'boolean') {
      const input = String(current) === 'true' ? 'false' : 'true';
      return { input, display: input };
    }
    if (field.type === 'date' || field.type === 'auto_date') return { input: '01/01/2000', display: '01/01/2000' };
    if (field.type === 'number') return { input: '777', display: '777' };
    return { input: 'edited by hand', display: 'edited by hand' };
  }

  test('a field an automation pre-fills stays with the person who edits it', async ({ page, request }) => {
    const types = await apiGet(request, '/asset-types');
    let picked = null;
    for (const type of types) {
      const { fields, automations } = await readForm(request, type.id);
      const defaults = createDefaults(fields, automations);
      for (let index = fields.length - 1; index >= 0; index -= 1) {
        const field = fields[index];
        if (field.type === 'quantity') continue;
        if (String(defaults[field.key] ?? '') === '') continue;
        if (!automations.some((rule) => rule.targetKey === field.key)) continue;
        const alt = alternative(field, defaults[field.key]);
        if (alt) {
          picked = { type, index, field, before: defaults[field.key], alt };
          break;
        }
      }
      if (picked) break;
    }
    test.skip(!picked, 'no stored rule pre-fills an editable field');

    const { writes, labels } = await openCreate(page, request, picked.type);
    const label = labels.nth(picked.index);
    const control = await fieldControl(label, picked.field);
    await expectFieldDisplay(label, picked.field, expectedDisplay(picked.field, picked.before), 'rule default');

    const isSelect = picked.field.type === 'dropdown' || picked.field.type === 'boolean';
    if (isSelect) await control.selectOption(picked.alt.input);
    else await control.fill(picked.alt.input);

    const message = `${picked.type.name} / ${picked.field.name}: the automation overwrote a manual edit`;
    await expectFieldDisplay(label, picked.field, picked.alt.display, message);
    // A later keystroke somewhere else must not hand the field back to the rule.
    await page.locator('main form label').first().locator('input, textarea').first().click();
    await expectFieldDisplay(label, picked.field, picked.alt.display, message);

    expect(writes, `editing a pre-filled field must not write: ${writes.join(', ')}`).toEqual([]);
  });

  test('Cancel leaves the create form without a write', async ({ page, request }) => {
    const types = await apiGet(request, '/asset-types');
    const type = types[0];
    const writes = watchWrites(page);
    const before = await apiGet(request, `/asset-types/${type.id}/assets?page=1`);

    await page.goto(`/asset-types/${type.id}`);
    await page.goto(`/asset-types/${type.id}/new`);
    await expect(page.getByRole('heading', { name: `Add ${type.name}`, exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    // AssetEditor cancels with nav(-1), so the browser history lands back on the type.
    await expect(page).toHaveURL(new RegExp(`/asset-types/${type.id}$`));

    const after = await apiGet(request, `/asset-types/${type.id}/assets?page=1`);
    expect(after.total).toBe(before.total);
    expect(writes, `cancelling must not write: ${writes.join(', ')}`).toEqual([]);
  });

  test('the server validates before it inserts, so a bad payload creates nothing', async ({ page, request }) => {
    // The suite never creates a production asset, so the "Save with a required
    // field still empty" path is proven from the other side: an unknown field key
    // is rejected by validateValues(), which runs before any INSERT. Clicking Save
    // here would only be safe if we were certain the server's own automation pass
    // leaves a required field empty - too fragile to bet on live data.
    const types = await apiGet(request, '/asset-types');
    const type = types[0];
    const before = await apiGet(request, `/asset-types/${type.id}/assets?page=1`);

    const { csrfToken } = await apiGet(request, '/auth/csrf');
    const res = await request.post(`/api/v1/asset-types/${type.id}/assets`, {
      headers: { 'X-CSRF-Token': csrfToken },
      data: { values: { __contract_probe__: 1 } },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNKNOWN_FIELD');

    const after = await apiGet(request, `/asset-types/${type.id}/assets?page=1`);
    expect(after.total, 'a rejected create must not add an asset').toBe(before.total);

    // And the form itself stays untouched on screen.
    await page.goto(`/asset-types/${type.id}/new`);
    await expect(page.getByText('Loading form...')).toHaveCount(0);
    const { fields } = await readForm(request, type.id);
    await expect(page.locator('main form label')).toHaveCount(fields.length);
  });

  test('an edit form drops quantity and shows the stored values', async ({ page, request }) => {
    const types = await apiGet(request, '/asset-types');
    const writes = watchWrites(page);
    let checked = 0;

    for (const type of types) {
      const list = await apiGet(request, `/asset-types/${type.id}/assets?page=1&pageSize=100`);
      if (!list.items.length) continue;
      const { fields } = await readForm(request, type.id);
      const asset = list.items[0];
      const stored = asset.values || {};
      const editable = fields.filter((field) => field.type !== 'quantity');

      await page.goto(`/asset-types/${type.id}`);
      await page.locator('main table tbody tr').first().getByRole('button', { name: 'Edit', exact: true }).click();
      const dialog = modal(page, new RegExp(`^Edit ${type.name}`));
      await expect(dialog).toBeVisible();
      await expect
        .poll(() => controlLabels(dialog), { timeout: 15_000, message: `${type.name}: edit fields never rendered` })
        .toEqual(editable.map((field) => field.name));

      const labels = dialog.locator('form label');
      for (const [index, field] of editable.entries()) {
        await expectFieldDisplay(
          labels.nth(index),
          field,
          expectedDisplay(field, stored[field.key]),
          `${type.name} / ${field.name} (${field.type}) stored value`,
        );
      }

      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(dialog).toHaveCount(0);
      checked += 1;
      if (checked >= 4) break;
    }

    expect(checked, 'no asset type has a stored asset to edit').toBeGreaterThan(0);
    expect(writes, `opening and cancelling an edit must not write: ${writes.join(', ')}`).toEqual([]);
  });
});
