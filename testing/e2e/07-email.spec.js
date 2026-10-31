import { test, expect } from '@playwright/test';
import { apiGet, expectLabels, fieldIn, modal, watchWrites } from '../helpers/app.js';

// The app's own placeholder list (client/src/pages/EmailNotifications.jsx).
const PLACEHOLDERS = [
  '{{asset_type_name}}',
  '{{asset_public_id}}',
  '{{created_at}}',
  '{{updated_at}}',
  '{{user.email}}',
  '{{user.name}}',
  '{{field.<key>}}',
  '{{field.<key>.previous}}',
];

const tabButton = (page, name) => page.getByRole('button', { name, exact: true });
// One Card row per stored template / recipient / rule.
const listRows = (page) => page.locator('main div.rounded-2xl.divide-y > div');
const fieldChips = (dialog) => dialog.locator('button.bg-indigo-50');

/** Rebuilds the field-placeholder list the Templates tab shows: the union of every
 * field key across the user's asset types, common ones first (mirrors the page). */
async function placeholderMeta(request) {
  const types = await apiGet(request, '/asset-types');
  const forms = await Promise.all(types.map((type) => apiGet(request, `/asset-types/${type.id}/form`)));
  const map = new Map();
  for (const form of forms) {
    const seen = new Set();
    for (const field of form) {
      const key = field.field_key || field.key;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const entry = map.get(key) || { key, name: field.name, usedIn: 0 };
      entry.usedIn += 1;
      map.set(key, entry);
    }
  }
  const meta = [...map.values()];
  return {
    typeCount: types.length,
    chips: [...meta.filter((f) => f.usedIn === types.length), ...meta.filter((f) => f.usedIn < types.length)],
  };
}

test.describe('email notifications', () => {
  test('Templates lists exactly the stored templates, with the API summary text', async ({
    page,
    request,
  }) => {
    const writes = watchWrites(page);
    const templates = await apiGet(request, '/email/templates');
    await page.goto('/email-notifications');
    await expect(page.getByRole('heading', { name: 'Email Notifications', exact: true })).toBeVisible();
    await expect(
      page.getByText('Create templates, manage recipients, and set rules that email when assets change.'),
    ).toBeVisible();
    for (const name of ['Templates', 'Recipients', 'Rules']) {
      await expect(tabButton(page, name)).toBeVisible();
    }

    const rows = listRows(page);
    await expect(rows).toHaveCount(templates.length);
    for (const [index, template] of templates.entries()) {
      const row = rows.nth(index);
      await expect(row.locator('div.font-medium')).toContainText(template.name);
      await expect(row.locator('div.text-xs')).toHaveText(template.subjectTemplate);
      await expect(row.getByText('inactive', { exact: true })).toHaveCount(template.isActive ? 0 : 1);
      await expect(row.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
      await expect(row.getByRole('button', { name: 'Delete', exact: true })).toBeVisible();
    }
    expect(writes, `reading the page must not write: ${writes.join(', ')}`).toEqual([]);
  });

  test('the new-template editor offers the placeholders and inserts them into the body', async ({
    page,
    request,
  }) => {
    const writes = watchWrites(page);
    const { typeCount, chips } = await placeholderMeta(request);
    expect(chips.length, 'no field is available as a placeholder').toBeGreaterThan(0);

    await page.goto('/email-notifications');
    await page.getByRole('button', { name: '+ New Template', exact: true }).click();
    const dialog = modal(page, 'New Template');
    await expectLabels(dialog, ['Name', 'Subject', 'Body', 'previous value (.previous)', 'Active']);

    const generalTexts = await dialog
      .locator('button.bg-slate-100')
      .evaluateAll((els) => els.map((el) => el.textContent));
    expect(generalTexts).toEqual(PLACEHOLDERS);

    await expect(
      dialog.getByText(`Common (all ${typeCount} asset types)`, { exact: true }),
    ).toBeVisible();
    const chipList = fieldChips(dialog);
    const chipLabels = await chipList.evaluateAll((els) => els.map((el) => el.textContent));
    expect(chipLabels).toEqual(chips.map((chip) => chip.name));

    // Clicking a chip appends its token - the whole point of the picker.
    const body = await fieldIn(dialog, 'Body');
    await chipList.first().click();
    await expect(body).toHaveValue(`{{field.${chips[0].key}}}`);

    // The .previous switch changes what the next click inserts.
    await dialog.getByText('previous value (.previous)').click();
    await chipList.first().click();
    await expect(body).toHaveValue(`{{field.${chips[0].key}}}{{field.${chips[0].key}.previous}}`);

    // A general placeholder appends too, and Cancel never saves.
    await dialog.locator('button.bg-slate-100').first().click();
    await expect(body).toHaveValue(
      `{{field.${chips[0].key}}}{{field.${chips[0].key}.previous}}{{asset_type_name}}`,
    );

    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(writes, `drafting a template must not save it: ${writes.join(', ')}`).toEqual([]);
    const after = await apiGet(request, '/email/templates');
    await expect(listRows(page)).toHaveCount(after.length);
  });

  test('the template editor prefills from a stored template and cancels cleanly', async ({
    page,
    request,
  }) => {
    const writes = watchWrites(page);
    const templates = await apiGet(request, '/email/templates');
    expect(templates.length, 'no template exists to open').toBeGreaterThan(0);
    const target = templates[0];

    await page.goto('/email-notifications');
    await listRows(page)
      .filter({ hasText: target.name })
      .first()
      .getByRole('button', { name: 'Edit', exact: true })
      .click();

    const dialog = modal(page, 'Edit Template');
    await expect(await fieldIn(dialog, 'Name')).toHaveValue(target.name);
    await expect(await fieldIn(dialog, 'Subject')).toHaveValue(target.subjectTemplate);
    await expect(await fieldIn(dialog, 'Body')).toHaveValue(target.bodyTemplate);
    await expect(dialog.getByLabel('Active', { exact: true })).toBeChecked();

    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(writes, `editing must not save: ${writes.join(', ')}`).toEqual([]);
  });

  test('Recipients lists the stored rows and the new-recipient form starts blank', async ({
    page,
    request,
  }) => {
    const writes = watchWrites(page);
    const recipients = await apiGet(request, '/email/recipients');
    await page.goto('/email-notifications');
    await tabButton(page, 'Recipients').click();

    const rows = listRows(page);
    await expect(rows).toHaveCount(recipients.length);
    for (const [index, recipient] of recipients.entries()) {
      const row = rows.nth(index);
      await expect(row.locator('div.font-medium')).toContainText(recipient.name || recipient.email);
      if (recipient.name) await expect(row.locator('div.text-xs')).toHaveText(recipient.email);
    }

    await page.getByRole('button', { name: '+ New Recipient', exact: true }).click();
    const dialog = modal(page, 'New Recipient');
    await expectLabels(dialog, ['Name', 'Email', 'Active']);
    await expect(await fieldIn(dialog, 'Name')).toHaveValue('');
    await expect(await fieldIn(dialog, 'Email')).toHaveValue('');
    await expect(dialog.getByLabel('Active', { exact: true })).toBeChecked();

    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(writes, `drafting a recipient must not save it: ${writes.join(', ')}`).toEqual([]);
  });

  test('Rules describe each stored rule exactly the way the API stores it', async ({
    page,
    request,
  }) => {
    const writes = watchWrites(page);
    const rules = await apiGet(request, '/email/rules');
    await page.goto('/email-notifications');
    await tabButton(page, 'Rules').click();

    const rows = listRows(page);
    await expect(rows).toHaveCount(rules.length);
    for (const [index, rule] of rules.entries()) {
      const row = rows.nth(index);
      const names = (rule.assetTypes?.length ? rule.assetTypes : [{ name: rule.assetTypeName }]).map(
        (type) => type.name,
      );
      await expect(row.locator('div.font-medium')).toContainText(names.join(', '));
      const expectedTrigger =
        rule.triggerType === 'asset_created'
          ? 'On asset created'
          : `On "${rule.triggerFieldKey}" ${rule.triggerCondition}` +
            (['equals', 'not_equals'].includes(rule.triggerCondition)
              ? ` ${rule.triggerConditionValue}`
              : '');
      await expect(row.locator('div.text-xs')).toHaveText(
        `${expectedTrigger} · template "${rule.templateName}" · ${rule.recipients.length} recipient(s)`,
      );
      // The Test button really sends mail, so it is only ever checked for, never clicked.
      for (const name of ['Test', 'Edit', 'Delete']) {
        await expect(row.getByRole('button', { name, exact: true })).toBeVisible();
      }
    }
    expect(writes, `reading rules must not write: ${writes.join(', ')}`).toEqual([]);
  });

  test('the rule editor builds its pickers from the API and cancels without writing', async ({
    page,
    request,
  }) => {
    const writes = watchWrites(page);
    const [types, templates, recipients] = await Promise.all([
      apiGet(request, '/asset-types'),
      apiGet(request, '/email/templates'),
      apiGet(request, '/email/recipients'),
    ]);

    await page.goto('/email-notifications');
    await tabButton(page, 'Rules').click();
    await page.getByRole('button', { name: '+ New Rule', exact: true }).click();
    const dialog = modal(page, 'New Rule');

    const typeLabels = await dialog
      .locator('div.grid.max-h-40 label span.truncate')
      .evaluateAll((els) => els.map((el) => el.textContent));
    expect(typeLabels).toEqual(types.map((type) => type.name));
    await expect(dialog.getByText('Select at least one asset type.', { exact: true })).toBeVisible();

    const trigger = await fieldIn(dialog, 'Trigger');
    expect(await trigger.inputValue()).toBe('asset_created');
    await expect(dialog.getByRole('button', { name: 'Save rule', exact: true })).toBeDisabled();

    // A field trigger only offers fields common to the selected asset types.
    await dialog.locator('div.grid.max-h-40 input[type="checkbox"]').first().check();
    await trigger.selectOption('field_changed');
    await expect(await fieldIn(dialog, 'Field')).toBeVisible();
    const condition = await fieldIn(dialog, 'Condition');
    expect(
      await condition.locator('option').evaluateAll((els) => els.map((el) => el.textContent)),
    ).toEqual(['Any change', 'Equals value', 'Not equals value', 'Becomes filled', 'Becomes empty']);
    await expect(dialog.getByLabel('Value', { exact: true })).toHaveCount(0);

    await condition.selectOption('equals');
    await expect(dialog.getByLabel('Value', { exact: true })).toHaveValue('');

    await trigger.selectOption('asset_created');
    const templateOptions = await (await fieldIn(dialog, 'Template'))
      .locator('option')
      .evaluateAll((els) => els.map((el) => el.textContent));
    expect(templateOptions).toEqual(['Select…', ...templates.map((t) => t.name)]);

    // Recipient rows are the bordered labels; the asset-type list uses plain labels.
    await expect(
      dialog.locator('label.border-slate-200 input[type="checkbox"]'),
    ).toHaveCount(recipients.length);

    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(writes, `drafting a rule must not save it: ${writes.join(', ')}`).toEqual([]);
    await expect(listRows(page)).toHaveCount((await apiGet(request, '/email/rules')).length);
  });
});

const STATUS_LABELS = ['All statuses', 'Pending', 'Sending', 'Sent', 'Failed', 'Cancelled'];

test.describe('email history', () => {
  test('the queue matches the API and every row shows its stored status', async ({ page, request }) => {
    const writes = watchWrites(page);
    const rows = await apiGet(request, '/email/history?limit=200');
    await page.goto('/email-history');
    await expect(page.getByRole('heading', { name: 'Email History', exact: true })).toBeVisible();
    await expect(
      page.getByText('Every notification email queued from your asset activity.'),
    ).toBeVisible();

    const statusSelect = await fieldIn(page.locator('main'), 'Status');
    expect(
      await statusSelect.locator('option').evaluateAll((els) => els.map((el) => el.textContent)),
    ).toEqual(STATUS_LABELS);

    const list = page.locator('main div.rounded-2xl.divide-y > div');
    await expect(list).toHaveCount(rows.length);
    for (const [index, row] of rows.entries()) {
      const item = list.nth(index);
      await expect(item.locator('span').first()).toHaveText(row.status);
      await expect(item.locator('span.truncate.font-medium')).toHaveText(row.template?.subject || '(no subject)');
      const meta = await item.locator('div.mt-1.truncate').first().innerText();
      expect(meta).toContain(row.eventType === 'asset_created' ? 'Asset created' : 'Field changed');
      if (row.assetPublicId) expect(meta).toContain(row.assetPublicId);
      if (row.status === 'failed' && row.lastError) {
        await expect(item.locator('div.mt-1.text-red-600')).toHaveText(row.lastError);
      }
    }
    expect(writes, `reading history must not write: ${writes.join(', ')}`).toEqual([]);
  });

  test('filtering by status asks the API for exactly that status', async ({ page, request }) => {
    const writes = watchWrites(page);
    const requested = [];
    page.on('request', (req) => {
      if (req.method() === 'GET' && req.url().includes('/email/history')) requested.push(req.url());
    });
    const sent = await apiGet(request, '/email/history?limit=200&status=sent');
    await page.goto('/email-history');
    const list = page.locator('main div.rounded-2xl.divide-y > div');
    await expect(list).toHaveCount((await apiGet(request, '/email/history?limit=200')).length);

    await (await fieldIn(page.locator('main'), 'Status')).selectOption('sent');
    await expect(list).toHaveCount(sent.length);
    for (const [index, row] of sent.entries()) {
      await expect(list.nth(index).locator('span').first()).toHaveText(row.status);
    }
    expect(requested.at(-1)).toContain('status=sent');
    expect(writes, `filtering is read-only: ${writes.join(', ')}`).toEqual([]);
  });

  test('the details panel shows the stored recipients, template and body snapshot', async ({
    page,
    request,
  }) => {
    const writes = watchWrites(page);
    const rows = await apiGet(request, '/email/history?limit=200');
    expect(rows.length, 'history is empty, nothing to expand').toBeGreaterThan(0);
    const target = rows[0];

    await page.goto('/email-history');
    const item = page.locator('main div.rounded-2xl.divide-y > div').first();
    await expect(item.getByText('Details', { exact: true })).toBeVisible();
    await item.locator('button').click();

    const panel = item.locator('div.border-t');
    const expectedTo = (target.recipients || []).map((x) => x.email || x).join(', ');
    // Each detail line is <div><span>Label:</span> value</div>, so the value lives in
    // its own text node - assert on the line, not on an exact whole-string match.
    await expect(panel.locator('div').filter({ hasText: /^To:/ }).first()).toContainText(expectedTo);
    await expect(
      panel.locator('div').filter({ hasText: /^Template:/ }).first(),
    ).toContainText(target.template?.name || '—');
    await expect(
      panel.locator('div').filter({ hasText: /^Attempts:/ }).first(),
    ).toContainText(String(target.attempts));
    if (target.template?.body) {
      await expect(panel.locator('pre')).toHaveText(target.template.body);
    }
    if (target.sentAt) await expect(panel.getByText(/^Sent:/).first()).toBeVisible();
    if (target.lastError) await expect(panel.getByText(/^Error:/).first()).toBeVisible();

    await expect(item.getByText('Hide', { exact: true })).toBeVisible();
    await item.locator('button').click();
    await expect(item.locator('div.border-t')).toHaveCount(0);
    expect(writes, `expanding a row must not write: ${writes.join(', ')}`).toEqual([]);
  });

  test('All users switches the query to every owner', async ({ page, request }) => {
    const writes = watchWrites(page);
    const mine = await apiGet(request, '/email/history?limit=200');
    const all = await apiGet(request, '/email/history/all?limit=200');
    await page.goto('/email-history');
    const list = page.locator('main div.rounded-2xl.divide-y > div');
    await expect(list).toHaveCount(mine.length);

    const requested = [];
    page.on('request', (req) => {
      if (req.method() === 'GET' && req.url().includes('/email/history')) requested.push(req.url());
    });
    await page.getByLabel('All users', { exact: true }).check();
    await expect(page.getByLabel('All users', { exact: true })).toBeChecked();
    await expect(list).toHaveCount(all.length);
    expect(requested, 'toggling All users re-queries the history').toContain(
      `${await page.evaluate(() => location.origin)}/api/v1/email/history/all?limit=200`,
    );
    expect(writes, `switching scope is read-only: ${writes.join(', ')}`).toEqual([]);
  });
});
