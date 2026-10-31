import { test, expect } from '@playwright/test';
import { currentContract, readBaseline, READ_ENDPOINTS } from '../helpers/contract.js';

// The API is what the whole client is built on, so this file compares the live
// responses against baselines/api-contract.json - captured before any refactoring
// started. Only key names and value *types* are compared, never values, so normal
// office edits (renaming a field, adding an asset) do not break the contract.
// If a change here is intentional, re-capture: node helpers/capture-snapshot.js
test.describe('API contract', () => {
  test('every read endpoint keeps its response shape', async ({ request }) => {
    const baseline = readBaseline();
    const live = await currentContract(request);

    expect(Object.keys(live.endpoints)).toEqual(READ_ENDPOINTS);
    for (const endpoint of READ_ENDPOINTS) {
      expect(live.endpoints[endpoint], `${endpoint} changed shape`).toEqual(baseline.endpoints[endpoint]);
    }
  });

  test('no read endpoint is missing (an unregistered path answers with SPA HTML)', async ({ request }) => {
    for (const endpoint of READ_ENDPOINTS) {
      const res = await request.get(`/api/v1${endpoint}`);
      const text = await res.text();
      expect(res.status(), `${endpoint} -> ${res.status()}`).toBeLessThan(400);
      expect(
        text.trim().startsWith('<!doctype'),
        `${endpoint} is not registered: the SPA fallback answered`,
      ).toBe(false);
    }
  });

  test('the routes that must NOT exist still do not exist', async ({ request }) => {
    // Documented in BUG-LOG: the API serves index.html for unknown /api paths, so
    // a "200" here is the bug, not a passing check - assert the HTML fallback.
    for (const path of ['/reports/summary', '/smtp', '/ip-access', '/assets/1']) {
      const res = await request.get(`/api/v1${path}`);
      const isHtml = (await res.text()).trim().startsWith('<!doctype');
      expect(isHtml || res.status() >= 400, `${path} unexpectedly answered as JSON`).toBe(true);
    }
  });

  test('each asset type keeps its column layout and rule set', async ({ request }) => {
    const baseline = readBaseline();
    const live = await currentContract(request);
    const typeIds = Object.keys(baseline.types).filter((key) => !key.startsWith('dropdown:'));

    for (const id of typeIds) {
      expect(live.types[id], `asset type ${id} disappeared or changed shape`).toMatchObject({
        form: baseline.types[id].form,
        automations: baseline.types[id].automations,
      });
    }
    for (const key of Object.keys(baseline.types).filter((k) => k.startsWith('dropdown:'))) {
      expect(live.types[key], `${key} changed`).toMatchObject({ options: baseline.types[key].options });
    }
    expect(live.fieldDefinitions, 'a field definition changed or disappeared').toEqual(
      baseline.fieldDefinitions,
    );
  });

  test('the field engine exposes every stored field type and no others', async ({ request }) => {
    const SUPPORTED = ['auto_date', 'boolean', 'date', 'dropdown', 'mobile', 'multiline', 'number', 'quantity', 'text'];
    const union = (contract) =>
      [...new Set(Object.values(contract.types).flatMap((entry) => (entry.form || []).map((column) => column.split(':')[2])))].sort();

    const baseline = readBaseline();
    const live = union(await currentContract(request));

    for (const type of live) {
      expect(SUPPORTED, `field type "${type}" is not one the client renders`).toContain(type);
    }
    expect(live, 'a field type vanished from or appeared in the stored forms').toEqual(union(baseline));
  });
});
