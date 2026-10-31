/**
 * Mobile layout audit - a diagnostic, not a test.
 *
 *   node scripts/mobile-audit.mjs [width] [height] [--dialogs]
 *
 * Opens every page in the same Firefox the suite uses, at a phone viewport, and
 * prints what a user would actually hit: page-level horizontal overflow, tables
 * that are wider than the card holding them, buttons whose label wrapped onto a
 * second line, and controls that overflow the viewport. Screenshots land in
 * .artifacts/mobile-audit/ for the eye. With --dialogs it then opens the main
 * dialogs too and reports anything the phone screen cuts off.
 */
import { firefox } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const width = Number(process.argv[2] ?? 360);
const height = Number(process.argv[3] ?? 800);
const OUT = '.artifacts/mobile-audit';
const ROUTES = [
  ['/', 'dashboard'],
  ['/asset-types/1', 'asset-type'],
  ['/reports', 'reports'],
  ['/common-form', 'common-form'],
  ['/fields', 'fields'],
  ['/dropdowns', 'dropdowns'],
  ['/email-notifications', 'email'],
  ['/email-history', 'email-history'],
  ['/users', 'users'],
  ['/settings', 'settings', 'full'],
];

const browser = await firefox.launch();
const context = await browser.newContext({
  viewport: { width, height },
  storageState: '.auth/admin.json',
  baseURL: 'http://127.0.0.1:3000',
});
mkdirSync(`${OUT}`, { recursive: true });

// Two pages can only be reached through a real record, so ask the API for one
// before the sweep. Read-only GETs, same cookie the suite caches.
const assets = await (
  await context.request.get('/api/v1/asset-types/1/assets?page=1&pageSize=5')
).json();
const samplePublicId = assets?.data?.items?.[0]?.publicId ?? null;
if (samplePublicId) ROUTES.push([`/assets/${samplePublicId}`, 'asset-detail']);
ROUTES.push(['/asset-types/1/new', 'asset-editor']);

for (const [route, name, full] of ROUTES) {
  const page = await context.newPage();
  await page.goto(route, { waitUntil: 'networkidle' });
  const report = await page.evaluate(() => {
    const doc = document.documentElement;
    const wrapped = [];
    for (const el of document.querySelectorAll('button, a')) {
      const text = el.innerText?.trim();
      if (!text || el.offsetHeight === 0) continue;
      const range = document.createRange();
      range.selectNodeContents(el);
      const lines = Array.from(range.getClientRects()).filter((r) => r.height > 1).length;
      const box = el.getBoundingClientRect();
      if (lines > 1 || box.width < 40 || box.right > innerWidth + 1 || box.left < -1) {
        wrapped.push({
          text: text.replace(/\s+/g, ' ').slice(0, 28),
          lines,
          w: Math.round(box.width),
          h: Math.round(box.height),
          right: Math.round(box.right),
        });
      }
    }
    const tables = Array.from(document.querySelectorAll('table')).map((table) => {
      const scroller = table.closest('[class*="overflow-x-auto"]');
      return {
        tableW: Math.round(table.getBoundingClientRect().width),
        cardW: Math.round((scroller ?? table.parentElement).getBoundingClientRect().width),
        scrollable: Boolean(scroller),
        columns: table.querySelectorAll('thead th').length,
      };
    });
    return {
      pageOverflowPx: doc.scrollWidth - doc.clientWidth,
      tables,
      oddControls: wrapped,
      // Is an action row actually using the phone's width, or is it a shrunk
      // island in the middle of the screen? children[] is what the user sees,
      // and scroll/client says whether a bar is a one-line swipe or a stack.
      actionBar: Array.from(document.querySelectorAll('.action-bar')).map((bar) => {
        const box = bar.getBoundingClientRect();
        return {
          barW: Math.round(box.width),
          barH: Math.round(box.height),
          scrollW: bar.scrollWidth,
          clientW: bar.clientWidth,
          viewportW: innerWidth,
          children: Array.from(bar.children).map((child) => {
            const c = child.getBoundingClientRect();
            const button = child.matches('button') ? child : child.querySelector('button');
            const b = (button ?? child).getBoundingClientRect();
            return `${child.innerText?.trim().replace(/\s+/g, ' ').slice(0, 16) || child.tagName.toLowerCase()}: ${Math.round(c.width)}/${Math.round(b.width)}@${Math.round(c.top)}`;
          }),
        };
      }),
    };
  });
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  if (full) await page.screenshot({ path: `${OUT}/${name}-full.png`, fullPage: true });
  console.log(`\n=== ${route} (${name}) @ ${width}x${height} ===`);
  console.log(`horizontal page overflow: ${report.pageOverflowPx}px`);
  for (const table of report.tables) {
    console.log(
      `table: ${table.tableW}px inside ${table.cardW}px, scrollable=${table.scrollable}, columns=${table.columns}`,
    );
  }
  for (const control of report.oddControls) {
    console.log(`  ! ${JSON.stringify(control)}`);
  }
  for (const bar of report.actionBar) {
    console.log(
      `  action-bar: ${bar.barW}x${bar.barH}px in ${bar.viewportW}px viewport, swipe=${bar.scrollW}>${bar.clientW}, children(cell/button px @top): ${bar.children.join(' , ')}`,
    );
  }
  await page.close();
}

await browser.close();

/**
 * The same pages with their most-used dialogs open, because that is where a phone
 * screen actually runs out of room. Read-only: nothing here clicks a Save button.
 */
const DIALOGS = [
  ['/', '+ Add Asset', 'modal-add-asset', 'Bluetooth Earbuds'],
  ['/fields', '+ Add Field', 'modal-add-field'],
  ['/users', '+ Add User', 'modal-add-user'],
  ['/email-notifications', '+ New Template', 'modal-new-template'],
  ['/asset-types/1', 'Configure Form', 'modal-configure-form'],
  ['/dropdowns', '+ Add', 'modal-add-dropdown'],
];

const shots = process.argv[4];
if (shots === '--dialogs') {
  const dialogBrowser = await firefox.launch();
  const dialogContext = await dialogBrowser.newContext({
    viewport: { width, height },
    storageState: '.auth/admin.json',
    baseURL: 'http://127.0.0.1:3000',
  });
  for (const [route, trigger, name, pick] of DIALOGS) {
    const page = await dialogContext.newPage();
    await page.goto(route, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: trigger, exact: true }).first().click();
    if (pick) await page.getByRole('button', { name: pick, exact: true }).first().click();
    await page.waitForTimeout(700);
    const overflow = await page.evaluate(() => {
      const dialog = document.querySelector('.fixed.inset-0.z-50 > div');
      if (!dialog) return { found: false };
      const box = dialog.getBoundingClientRect();
      const clipped = [];
      for (const el of dialog.querySelectorAll('button, input, select, textarea, label')) {
        const r = el.getBoundingClientRect();
        if (r.width && (r.right > innerWidth + 1 || r.left < -1)) {
          clipped.push(`${el.tagName.toLowerCase()}.${el.className.toString().split(' ')[0]}@${Math.round(r.right)}`);
        }
      }
      return { found: true, box: { x: Math.round(box.x), w: Math.round(box.width) }, clipped: clipped.slice(0, 6) };
    });
    console.log(`\n${name}: ${JSON.stringify(overflow)}`);
    await page.screenshot({ path: `${OUT}/${name}.png` });
    await page.evaluate(() => {
      const dialog = document.querySelector('.fixed.inset-0.z-50 > div');
      dialog?.scrollTo(0, dialog.scrollHeight);
    });
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${OUT}/${name}-bottom.png` });
    await page.close();
  }

  // Two states no page load shows: the bulk-action bar (needs a selection) and the
  // notification bell panel. Both are read-only.
  const list = await dialogContext.newPage();
  await list.goto('/asset-types/1', { waitUntil: 'networkidle' });
  await list.getByLabel('Select visible assets').check();
  await list.waitForTimeout(400);
  await list.screenshot({ path: `${OUT}/bulk-bar.png` });
  await list.close();

  const bell = await dialogContext.newPage();
  await bell.goto('/', { waitUntil: 'networkidle' });
  await bell.getByRole('button', { name: /notifications/i }).first().click();
  await bell.waitForTimeout(400);
  await bell.screenshot({ path: `${OUT}/notification-panel.png` });
  await bell.close();

  await dialogBrowser.close();
}
