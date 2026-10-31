import { test, expect } from '@playwright/test';
import { apiGet, modal, watchWrites } from '../../helpers/app.js';

/**
 * Phone layout locks (360x800 - the smallest viewport the app supports is 320px,
 * and 360 is what the team's own handsets report). Every rule here measures the
 * rendered box model, so it fails if a future change brings back the two defects
 * that were reported: controls that render at the wrong size, and rows/toolbars
 * whose pieces "fit" only by wrapping into a ragged staircase.
 *
 * An `.action-bar` has two approved phone shapes: the even two-column grid, and -
 * for the eight-action asset-type toolbar - one row that swipes sideways. Both are
 * locked below; what neither may be is a stack of rows eating the screen.
 *
 * Read-only like the rest of the suite: dialogs are opened and closed, never saved.
 */

const ROUTES = [
  '/',
  '/asset-types/1',
  '/reports',
  '/common-form',
  '/fields',
  '/dropdowns',
  '/email-notifications',
  '/email-history',
  '/users',
  '/settings',
];

/** A real asset, so the detail page and its editor are swept like every other route. */
async function phoneRoutes(request) {
  const list = await apiGet(request, '/asset-types/1/assets?page=1');
  const extra = [];
  if (list.items?.length) extra.push(`/assets/${list.items[0].publicId}`);
  extra.push('/asset-types/1/new');
  return [...ROUTES, ...extra];
}

/** Boxes of the elements a selector matches, in viewport coordinates. */
function boxes(scope) {
  return scope.evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return {
        text: (el.innerText || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 24),
        left: Math.round(r.left),
        top: Math.round(r.top),
        width: Math.round(r.width),
        height: Math.round(r.height),
      };
    }),
  );
}

/** Groups boxes into visual rows: items sharing a top edge sit on one line. */
function asRows(boxes_) {
  const rows = [];
  for (const box of boxes_) {
    const row = rows.find((r) => Math.abs(r.top - box.top) < Math.min(18, r.height));
    if (row) {
      row.items.push(box);
      row.right = Math.max(row.right, box.left + box.width);
    } else {
      rows.push({ top: box.top, height: box.height, right: box.left + box.width, items: [box] });
    }
  }
  return rows.sort((a, b) => a.top - b.top);
}

test.describe('phone layout @ 360px', () => {
  test('no page scrolls sideways, and nothing sticks out past the screen', async ({ page, request }) => {
    for (const route of await phoneRoutes(request)) {
      await page.goto(route, { waitUntil: 'networkidle' });
      const measured = await page.evaluate(() => {
        const doc = document.documentElement;
        const limit = doc.clientWidth;
        const offenders = [];
        for (const el of document.querySelectorAll('main *')) {
          const r = el.getBoundingClientRect();
          if (!r.width || !r.height) continue;
          if (r.right <= limit + 1 && r.left >= -1) continue;
          // A piece that sits inside its own sideways scroller is the intended
          // pattern: data tables, the header nav strip, and the asset-type toolbar.
          if (el.closest('[class*="overflow-x-auto"], .action-bar-scroll')) continue;
          offenders.push(`${el.tagName.toLowerCase()}[${(el.className || '').toString().split(' ').slice(0, 2).join('.')}] right=${Math.round(r.right)}`);
        }
        return { overflowPx: doc.scrollWidth - limit, offenders: offenders.slice(0, 5) };
      });
      expect(measured.overflowPx, `${route}: horizontal page overflow`).toBe(0);
      expect(measured.offenders, `${route}: elements outside the viewport`).toEqual([]);
    }
  });

  test('controls render at the size their classes ask for', async ({ page }) => {
    // The reported "buttons look too big on mobile" was a CSS cascade bug: an
    // unlayered `font: inherit` on button/input carried font-size and beat every
    // text-* utility, so a text-sm button painted at 16px.
    await page.goto('/users');
    const add = page.getByRole('button', { name: '+ Add User', exact: true });
    await expect(add).toBeVisible();
    expect(await add.evaluate((el) => getComputedStyle(el).fontSize), 'text-sm Button').toBe('14px');
    const logout = page.getByRole('button', { name: 'Logout', exact: true });
    expect(await logout.evaluate((el) => getComputedStyle(el).fontSize), 'text-sm Logout').toBe('14px');

    await page.goto('/common-form');
    const remove = page.getByRole('button', { name: 'Remove', exact: true }).first();
    await expect(remove).toBeVisible();
    expect(await remove.evaluate((el) => getComputedStyle(el).fontSize), 'size="sm" Button').toBe('13px');
  });

  test('no button label is squeezed onto extra lines', async ({ page, request }) => {
    for (const route of await phoneRoutes(request)) {
      await page.goto(route, { waitUntil: 'networkidle' });
      const tall = await page.evaluate(() => {
        const bad = [];
        for (const el of document.querySelectorAll('main button, main a')) {
          const r = el.getBoundingClientRect();
          if (!r.width || !r.height) continue;
          // Only single-run labels can "wrap": a list item built from a title div
          // over a caption div is two lines by design, not a squeezed label.
          const singleRun = Array.from(el.children).every((child) =>
            getComputedStyle(child).display.startsWith('inline'),
          );
          if (!singleRun) continue;
          const size = Number(getComputedStyle(el).fontSize.replace('px', ''));
          // One line of a button label is ~1.5x its font plus the vertical padding;
          // anything past 2.6x has wrapped, which is what "+ Add Field" did at 92px.
          if (r.height > size * 2.6 + 24) {
            bad.push(`${(el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 24)} = ${Math.round(r.height)}px`);
          }
        }
        return bad.slice(0, 5);
      });
      expect(tall, `${route}: wrapped button labels`).toEqual([]);
    }
  });

  test('an action bar becomes an even two-column grid', async ({ page, request }) => {
    const list = await apiGet(request, '/asset-types/1/assets?page=1');
    expect(list.items?.length, 'the suite needs one asset to open its detail page').toBeGreaterThan(0);
    // The asset-type toolbar is not here: eight actions in two columns would be four
    // rows tall, so it swipes instead - see the next test.
    for (const route of ['/users', `/assets/${list.items[0].publicId}`]) {
      await page.goto(route, { waitUntil: 'networkidle' });
      const bar = page.locator('main .action-bar').first();
      await expect(bar).toBeVisible();
      const measured = await bar.evaluate((el) => {
        const box = el.getBoundingClientRect();
        return {
          width: Math.round(box.width),
          gap: Number(getComputedStyle(el).columnGap.replace('px', '')),
          children: Array.from(el.children).map((child) => {
            const r = child.getBoundingClientRect();
            return { text: child.textContent.trim().slice(0, 20), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
          }),
        };
      });
      const rows = asRows(measured.children.map((c) => ({ ...c, left: 0 })));
      const half = Math.round((measured.width - measured.gap) / 2);
      expect(rows.length, `${route}: the bar wrapped into too many rows`).toBeLessThanOrEqual(
        Math.ceil(measured.children.length / 2) + 1,
      );
      for (const row of rows) {
        const widths = row.items.map((item) => item.width);
        const spread = Math.max(...widths) - Math.min(...widths);
        expect(spread, `${route}: uneven buttons in one row: ${row.items.map((i) => i.text).join(', ')}`).toBeLessThanOrEqual(2);
        // A two-up row splits the bar; a lone item may take it (a long label).
        expect(widths[0], `${route}: ${row.items[0].text} width`).toBeLessThanOrEqual(
          row.items.length > 1 ? half + 2 : measured.width + 2,
        );
        expect(widths[0]).toBeGreaterThanOrEqual(40);
        expect(row.items[0].height, `${route}: ${row.items[0].text} tap target`).toBeGreaterThanOrEqual(36);
      }
    }
  });

  test('the asset-type toolbar swipes sideways in one row instead of stacking', async ({ page }) => {
    await page.goto('/asset-types/1', { waitUntil: 'networkidle' });
    const bar = page.locator('main .action-bar-scroll').first();
    await expect(bar).toBeVisible();
    const measured = await bar.evaluate((el) => {
      const style = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      return {
        flexWrap: style.flexWrap,
        overflowX: style.overflowX,
        justifyContent: style.justifyContent,
        barWidth: Math.round(box.width),
        barRight: Math.round(box.right),
        viewportWidth: innerWidth,
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        children: Array.from(el.children).map((child) => {
          const r = child.getBoundingClientRect();
          const button = child.matches('button') ? child : child.querySelector('button');
          return {
            text: (child.textContent || '').trim().slice(0, 20),
            top: Math.round(r.top),
            width: Math.round(r.width),
            height: Math.round(r.height),
            buttonWidth: Math.round((button ?? child).getBoundingClientRect().width),
            // A nowrap label squeezed below its own width spills out of the box.
            contentWidth: child.scrollWidth,
          };
        }),
      };
    });
    expect(
      [measured.flexWrap, measured.overflowX, measured.justifyContent],
      'the bar must be one nowrap row inside its own sideways scroller',
    ).toEqual(['nowrap', 'auto', 'flex-start']);
    // flex-end on an overflowing flex row hides its first items in an unreachable
    // left scroll zone, so the scroller itself must stay inside the screen.
    expect(measured.barRight, 'the scroller must not hang off the screen').toBeLessThanOrEqual(
      measured.viewportWidth + 1,
    );
    // Eight actions at label width cannot fit 328px, which is what makes it a swipe.
    expect(measured.scrollWidth, 'the row is not scrollable').toBeGreaterThan(measured.clientWidth);
    const rows = asRows(measured.children.map((c) => ({ ...c, left: 0 })));
    expect(
      rows.length,
      `the bar stacked again: ${rows.map((row) => row.items.map((i) => i.text).join(' / ')).join(' + ')}`,
    ).toBe(1);
    for (const child of measured.children) {
      expect(child.width, `${child.text}: too narrow to tap`).toBeGreaterThanOrEqual(40);
      expect(child.height, `${child.text}: tap target`).toBeGreaterThanOrEqual(36);
      expect(child.contentWidth, `${child.text}: label crushed past its box`).toBeLessThanOrEqual(
        child.width + 2,
      );
      // The <a> wrapper must not leave its button narrower than the cell.
      expect(child.buttonWidth, `${child.text} does not fill its cell`).toBeGreaterThanOrEqual(
        child.width - 1,
      );
    }
    // Swiping to the end really lands on the last action - the point of the row.
    await bar.evaluate((el) => {
      el.scrollLeft = el.scrollWidth;
    });
    const last = page.locator('main .action-bar-scroll > *').last();
    const lastBox = await last.boundingBox();
    expect(
      Math.round(lastBox.x + lastBox.width),
      'the last action stays unreachable after a full swipe',
    ).toBeLessThanOrEqual(measured.viewportWidth + 1);
  });

  test('an action bar uses the whole screen, and a Link button fills its cell', async ({ page, request }) => {
    const list = await apiGet(request, '/asset-types/1/assets?page=1');
    expect(list.items?.length, 'the suite needs one asset to open its detail page').toBeGreaterThan(0);
    for (const route of ['/asset-types/1', `/assets/${list.items[0].publicId}`]) {
      await page.goto(route, { waitUntil: 'networkidle' });
      const bar = page.locator('main .action-bar').first();
      await expect(bar).toBeVisible();
      const measured = await bar.evaluate((el) => {
        const parent = el.parentElement;
        const style = getComputedStyle(parent);
        const content =
          parent.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        return {
          barWidth: Math.round(el.getBoundingClientRect().width),
          parentContentWidth: Math.round(content),
          cells: Array.from(el.children).map((child) => {
            const box = child.getBoundingClientRect();
            const button = child.matches('button') ? child : child.querySelector('button');
            return {
              text: (child.textContent || '').trim().slice(0, 20),
              isLink: child.tagName === 'A',
              cellWidth: Math.round(box.width),
              buttonWidth: Math.round((button ?? child).getBoundingClientRect().width),
              top: Math.round(box.top),
            };
          }),
        };
      });
      // Shrunk to its content, the bar floated as a 137px island under a 360px title.
      expect(measured.barWidth, `${route}: the bar is an island, not a row`).toBeGreaterThanOrEqual(
        measured.parentContentWidth - 2,
      );
      for (const cell of measured.cells) {
        // An <a> does not stretch its inline-flex child, so "+ Add Asset" sat at its
        // own width inside a half-width cell.
        expect(cell.buttonWidth, `${route}: ${cell.text} does not fill its cell`).toBeGreaterThanOrEqual(
          cell.cellWidth - 1,
        );
      }
      const linkCells = measured.cells.filter((cell) => cell.isLink);
      if (route === '/asset-types/1') {
        expect(linkCells.length, 'the asset-type bar must still hold a Link-wrapped button').toBeGreaterThan(0);
      }
      const firstRow = measured.cells.filter((cell) => Math.abs(cell.top - measured.cells[0].top) < 18);
      expect(firstRow.length, `${route}: the first action row should pair two buttons`).toBeGreaterThan(1);
    }
  });

  test('a common-form row keeps its arrows and Remove beside the name', async ({ page }) => {
    await page.goto('/common-form');
    const remove = page.getByRole('button', { name: 'Remove', exact: true }).first();
    await expect(remove).toBeVisible();
    const row = page.locator('main div.flex.flex-wrap').filter({ has: remove }).first();
    const name = row.locator('div.font-medium').first();
    const flags = row.locator('label').first();

    const [nameBox, removeBox, flagsBox] = await Promise.all([
      boxes(name),
      boxes(remove),
      boxes(flags),
    ]);
    expect(Math.abs(nameBox[0].top - removeBox[0].top), 'name and Remove share the first line').toBeLessThan(20);
    expect(flagsBox[0].top, 'the flags move below that line').toBeGreaterThan(removeBox[0].top + 5);
    // The name keeps real room instead of collapsing to a three-line column.
    expect(nameBox[0].width).toBeGreaterThanOrEqual(80);
  });

  test('a dialog footer stacks its buttons full width, primary on top', async ({ page, request }) => {
    const types = await apiGet(request, '/asset-types');
    const first = types[0];

    await page.goto('/');
    const writes = watchWrites(page);
    await page.getByRole('button', { name: '+ Add Asset', exact: true }).click();
    const dialog = modal(page, 'Add Asset');
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Asset Type').fill(first.name);
    await dialog.getByRole('button', { name: first.name, exact: true }).click();

    // The picked type's fields land a moment later ("Loading fields...") and the footer
    // moves down when they do. Same settle wait 02-dashboard uses: measuring and clicking
    // a footer that is still reflowing is how a Cancel click lands on empty space.
    await expect(dialog.getByText('Loading fields...')).toHaveCount(0);

    const footer = dialog.locator('.dialog-actions');
    await expect(footer).toBeVisible();
    const measured = await footer.evaluate((el) => {
      const box = el.getBoundingClientRect();
      return {
        width: Math.round(box.width),
        children: Array.from(el.children).map((child) => {
          const r = child.getBoundingClientRect();
          return { text: child.textContent.trim(), top: Math.round(r.top), width: Math.round(r.width) };
        }),
      };
    });
    const save = measured.children.find((child) => child.text.startsWith('Save'));
    const cancel = measured.children.find((child) => child.text === 'Cancel');
    expect(save, `footer buttons: ${measured.children.map((c) => c.text).join(' / ')}`).toBeTruthy();
    expect(cancel).toBeTruthy();
    expect(save.width, 'the primary action fills the row').toBeGreaterThanOrEqual(measured.width - 2);
    expect(cancel.width).toBeGreaterThanOrEqual(measured.width - 2);
    expect(save.top, 'the primary action sits above Cancel for the thumb').toBeLessThan(cancel.top);

    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(writes, `inspecting the dialog must not write: ${writes.join(', ')}`).toEqual([]);
  });

  test('the page name is printed once - in the header, not repeated below it', async ({ page }) => {
    const NAV_TITLES = [
      ['/', 'Assets'],
      ['/reports', 'Reports'],
      ['/common-form', 'Common Form'],
      ['/fields', 'Field Definitions'],
      ['/dropdowns', 'Dropdowns'],
      ['/email-notifications', 'Email Notifications'],
      ['/email-history', 'Email History'],
      ['/users', 'Users'],
      ['/settings', 'Settings'],
    ];
    for (const [route, name] of NAV_TITLES) {
      await page.goto(route, { waitUntil: 'networkidle' });
      const header = page.locator('header h1');
      await expect(header, `${route}: the compact header carries the page name`).toHaveText(name);
      // The in-page <h2> stays in the DOM (desktop is its only title) but must not paint here.
      const pageTitle = page.locator('main .page-title');
      await expect(pageTitle, `${route}: the page still renders its title element`).toHaveCount(1);
      await expect(pageTitle).toBeHidden();
      await expect(page.getByRole('heading', { name, exact: true })).toHaveCount(1);
    }
  });

  test('table headers stay on one line inside their scroller', async ({ page }) => {
    for (const route of ['/fields', '/asset-types/1', '/reports']) {
      await page.goto(route, { waitUntil: 'networkidle' });
      const header = page.locator('main table thead th').first();
      await expect(header).toBeVisible();
      const tallest = await page.locator('main table thead th').evaluateAll((els) =>
        Math.max(...els.map((el) => Math.round(el.getBoundingClientRect().height))),
      );
      expect(tallest, `${route}: tallest header`).toBeLessThan(44);
      const scroller = await page.locator('main table').first().evaluate((el) =>
        Boolean(el.closest('[class*="overflow-x-auto"]')),
      );
      expect(scroller, `${route}: the table needs its own horizontal scroller`).toBe(true);
    }
  });
});
