import { expect } from '@playwright/test';

export const GUEST_STATE = { cookies: [], origins: [] };

export async function apiGet(request, path) {
  const res = await request.get(`/api/v1${path}`);
  if (!res.ok()) {
    const isHtml = (await res.text()).trim().startsWith('<!doctype');
    throw new Error(`GET ${path} -> ${res.status()}${isHtml ? ' (HTML fallback: route not registered)' : ''}`);
  }
  const body = await res.json();
  return body.data;
}

/** Opens the modal or panel that a button with this exact label reveals. */
export async function openByButton(page, label) {
  await page.getByRole('button', { name: label, exact: false }).first().click();
}

/**
 * The app's Modal has no role="dialog": it is the fixed overlay (z-50) whose
 * heading is the title. Scope every modal assertion to this locator so a stray
 * element on the page cannot satisfy it.
 */
export function modal(page, title) {
  return page
    .locator('div.fixed.inset-0.z-50')
    .filter({ has: page.getByRole('heading', { name: title, exact: true }) })
    .last();
}

/**
 * Reads the visible name of a label, table header or cell: whitespace collapsed,
 * the decorative glyphs the app adds (calendar ▦, column filter ▾/●, sort arrows)
 * removed, and the trailing required marker dropped.
 */
export function cleanText(value) {
  return String(value)
    .replace(/\s+/g, ' ')
    .replace(/[▦▾▴●↑↓]+/g, '')
    .trim()
    .replace(/ \*$/, '')
    .trim();
}

/** Label text of every labelled control inside a scope, in DOM order. The name
 * is the label's first span (every control in ui.jsx is built that way), so the
 * widget itself - calendar button, quantity stepper, error text - never leaks
 * into the comparison with the API field names. */
export function controlLabels(scope) {
  return scope.locator('label').evaluateAll((els) =>
    els.map((el) => {
      const nameSpan = el.querySelector(':scope > span');
      return (nameSpan ? nameSpan.textContent : el.textContent) || '';
    }),
  ).then((list) => list.map(cleanText));
}

/** Same, retried until the labels settle - the SPA keeps rendering after goto(). */
export async function expectLabels(scope, expected) {
  await expect.poll(() => controlLabels(scope), { timeout: 15000 }).toEqual(expected);
}

/** Text of every cell in a scope that matches, cleaned the same way.
 * (evaluateAll runs in the browser, so the cleaning happens back in Node.) */
export async function textOf(scope) {
  const raw = await scope.evaluateAll((els) => els.map((el) => el.innerText));
  return raw.map(cleanText).filter(Boolean);
}

/** Text of one table column, row by row, keeping empty cells so the array stays
 * index-aligned with the API rows the table was rendered from. */
export async function columnTexts(rows, index) {
  const raw = await rows.evaluateAll(
    (trs, i) => trs.map((tr) => tr.children[i]?.innerText ?? ''),
    index,
  );
  return raw.map(cleanText);
}

/** Records every non-GET call the browser makes for the rest of the test.
 * The suite is a read-only suite: if this list is non-empty after an interaction,
 * that interaction wrote to the live production database and the test must fail. */
export function watchWrites(page) {
  const writes = [];
  page.on('request', (request) => {
    if (request.method() === 'GET' || !request.url().includes('/api/v1/')) return;
    writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
  });
  // The app uses window.confirm before some deletes; dismiss so nothing is posted.
  page.on('dialog', (dialog) => dialog.dismiss());
  return writes;
}

/** Asserts no overlay is open any more (the app unmounts a closed Modal). */
export async function expectNoModal(page) {
  await expect(page.locator('div.fixed.inset-0.z-50')).toHaveCount(0);
}

/** Current value of every control a scope matches, as the browser sees them. */
export function inputValues(scope) {
  return scope.evaluateAll((els) => els.map((el) => el.value));
}

/** Checked state of every checkbox a scope matches. */
export function checkedStates(scope) {
  return scope.evaluateAll((els) => els.map((el) => el.checked));
}

/** Waits until the matched controls hold exactly these values, in DOM order.
 * The suite needs the retry because the SPA keeps rendering after page.goto()
 * returns, and a single evaluateAll() read would settle on the empty pre-render DOM. */
export async function expectValues(scope, expected) {
  await expect.poll(() => inputValues(scope), { timeout: 15000 }).toEqual(expected);
}

/** Same, for checkboxes: waits for the matched inputs to hold these checked states. */
export async function expectChecked(scope, expected) {
  await expect.poll(() => checkedStates(scope), { timeout: 15000 }).toEqual(expected);
}

/** Reads a labelled control inside the currently open dialog (or the page).
 * The scope must be a Locator, since evaluateAll only exists on one. */
export async function fieldIn(scope, label) {
  const control = scope.locator('label').filter({ hasText: label }).first()
    .locator('input, select, textarea').first();
  await expect(control, `no control labelled "${label}"`).toBeVisible();
  return control;
}

export async function labelledValues(scope) {
  return scope.evaluate(() =>
    Array.from(document.querySelectorAll('label'))
      .map((l) => {
        const control = l.querySelector('input, select, textarea');
        if (!control) return null;
        const name = l.innerText.replace(/\s+/g, ' ').trim();
        return { name, value: String(control.value), tag: control.tagName.toLowerCase() };
      })
      .filter(Boolean),
  );
}

/** Types into a React-controlled input the way a user does (native setter + input event). */
export async function typeInto(page, locator, value) {
  await locator.click();
  await locator.fill(value);
  await expect(locator).toHaveValue(value);
}

export function todayIST() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** ISO YYYY-MM-DD rendered inside a DateInput as DD/MM/YYYY. */
export function asDisplayDate(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
