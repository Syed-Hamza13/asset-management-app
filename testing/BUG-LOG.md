# Bug log

Everything found while building the behaviour-lock suite, in the order it was found.
"Found by" names the test that surfaces it, so a future run can point straight at it.

Status legend:

- **fixed** — production code changed, verified live.
- **open (kept)** — real, but the current behaviour is the intended one; locked by a test so a refactor cannot silently change it.
- **harness** — a quirk of Firefox/Playwright that the suite works around. Not an app bug.

---

## #1 Users page said "17 capabilityies granted" — fixed

`client/src/pages/Users.jsx:201` pluralised `capability` with a naive `+ "ies"`.

Found by: `e2e/08-users.spec.js` (the row-subtitle assertion).

Fix: `` `${u.permissions.length} capabilit${u.permissions.length === 1 ? "y" : "ies"} granted` ``.
Verified in a rebuilt `client/dist` on `http://127.0.0.1:3000/users`: the admin row reads
"Full access to everything", a 17-permission user row reads "17 capabilities granted", and a
1-permission row reads "1 capability granted".

## #2 An unregistered `/api/v1/...` path answers with HTTP 200 + HTML — open (kept)

`client/src/app.js`-style SPA fallback is registered after the API router, so a typo in a route
name does **not** produce a 404. `GET /api/v1/reports/summary` returns the React `index.html` with
status 200. Any client code that checks only `res.ok` would treat a broken endpoint as a success
and then crash on `.json()`.

Found by: `e2e/90-api-contract.spec.js` (test "every read endpoint answers with JSON, never the SPA
fallback"), which asserts the shapes for the 23 real endpoints and asserts that `/reports/summary`,
`/smtp`, `/ip-access`, `/assets/1` still fall back to HTML or a 4xx.

Why it stays: it is the same mechanism that makes deep links like `/asset-types/4` work after a
refresh. Fixing it properly means scoping the fallback to non-`/api` paths — a behaviour change
this suite would need to re-lock first.

Mitigation already in place for tests: `helpers/app.js#apiGet` annotates a failing status with
"(HTML fallback: route not registered)" when the body is the SPA page, and a 200-HTML body makes
`res.json()` throw, so no test can silently pass on it. `e2e/90` additionally reads those paths as
raw text and asserts they are HTML/4xx.

## #3 Common Form "Add field" dropdown never filters out inactive field definitions — open (kept)

`client/src/pages/CommonForm.jsx:122`:

```js
(field) => !attached.has(field.id) && field.is_active !== false,
```

`GET /api/v1/fields` returns MySQL's `TINYINT` as `is_active: 1` / `is_active: 0`, never `true` /
`false`. `0 !== false` is `true` in JS (strict comparison, no coercion), so the guard is always
satisfied and **deactivated field definitions still appear in the "Add field to common form..."
list**. Selecting one attaches a field the admin has explicitly turned off.

Found by: `e2e/04-common-form.spec.js`, which asserts the current (unfiltered) list so the
behaviour is visible and intentional rather than accidental.

Why it stays: fixing it (`field.is_active !== 0`, or normalising to boolean in the API) would
remove options from a screen staff use daily. That is a product decision, not a refactor. Flagged
for you — say the word and it becomes a one-line fix plus a test flip.

## #4 Login is rate-limited to 10 attempts / 15 min per IP — open (kept)

The suite authenticates as the real admin (`techteam@eklavya.in`), and that IP is the same one you
use. A naive suite that logs in per spec would lock the two of us out of production.

Found by: the first full run, where re-login attempts began returning 429.
Mitigation: `helpers/global-setup.js` caches the session in `testing/.auth/admin.json` and only
re-logs-in when `GET /api/v1/auth/me` fails. `e2e/99-logout.spec.js` runs last, re-logs in exactly
once, and rewrites the cache, so the total write count per run is 1 login + 1 logout.

## #5 No read-only test can reach the `boolean` and `mobile` widgets — open (kept)

`client/src/pages/Fields.jsx:15-25` offers nine field types; production currently uses seven of
them (`auto_date, date, dropdown, multiline, number, quantity, text`). Because the suite is
read-only, it cannot create a `boolean` or `mobile` field just to look at it.

Found by: `e2e/91-dynamic-form-contract.spec.js`, which compares the types it saw on live forms
against the types the baseline says are in use, and records a `coverage-gap` annotation for the two
others instead of silently passing. `mobile` rendering (`type=tel`, `inputmode=tel`, placeholder
`e.g. 9876543210`) is asserted wherever it exists; `boolean` is covered as `<select>` with
`Select...` + the two options.

Compensation: the unit tests (`testing/unit/`) cover server-side validation and the automation
engine for all nine types, including `boolean`/`mobile`.

## #6 `DateInput` shows a required marker but marks no input as required — open (kept)

`client/src/components/ui.jsx` `DateInput` puts ` *` in the label span and forwards `required` to
nothing: the visible `input[type=text]`, the hidden `input[type=date]` and the `<label>` all lack
the attribute. So an empty required date field is caught by the server
(`400 REQUIRED_FIELD "<name> is required."`), not by the browser.

Found by: `e2e/91-dynamic-form-contract.spec.js` — the date label resolves to exactly two inputs
and neither carries `required`.

## #7 The quantity field never shows the required marker — open (kept)

On `AssetForm`, quantity is rendered with two stepper buttons and a `<span>` value (no text input),
and its label deliberately has no ` *` even though the quantity key is present and server-required.
`e2e/91` asserts "no marker" for quantity and "marker present" for every other required field, so
an accidental change to either will fail the suite.

## #8 Firefox gives a label-wrapped `<textarea>` an accessible name that includes its placeholder — harness

`getByLabel('Notification message', { exact: true })` matched 0 elements in Firefox even though the
DOM was correct, because the computed name was `"Notification message Type the message..."`.

Found by: `e2e/09-settings.spec.js`.
Fix: use the shared `fieldIn(scope, label)` helper (label container by `hasText`, then its first
control) for textareas everywhere. Documented in `README.md`.

## #9 Buttons the suite deliberately never clicks — safety

These all mutate production data (the dev server writes to the live MySQL). The suite reads the
result of each one from the API and from the DOM instead:

- Save / Create / Update on every asset, field, dropdown, user, common-form and settings form.
- Delete / Deactivate / Remove on asset types, assets, fields, dropdowns, options, users, rules.
- "Copy to users" confirm, Share dialog save, password-reset, type-change confirmation.
- Quick Entry Submit past the client-side guard (blocked before the POST by design).
- Logout outside `99-logout.spec.js`, which owns the single re-login.

`helpers/app.js#watchWrites(page)` records every non-GET `/api/v1` call so any test that
accidentally triggers one fails loudly, and specs assert "zero writes" after UI interactions that
should be read-only.

---

# Baseline run log

First full run of the suite, before any refactor, on unmodified production behaviour.

Environment: dev API on `http://127.0.0.1:3000` serving `client/dist`, headless Firefox, live DB.

```
testing$ npm run test:unit
ℹ tests 21
ℹ pass 21
ℹ fail 0

testing$ npx playwright test --project=firefox --reporter=list
73 passed (2.2m)

testing$ HEADED=1 npx playwright test --project=firefox --headed --reporter=list
73 passed (2.3m)     (visible Firefox windows; same cached admin session reused)
```

Per spec file (all green):

| File | Tests |
| --- | --- |
| `e2e/01-shell-auth.spec.js` | 5 |
| `e2e/02-dashboard.spec.js` | 4 |
| `e2e/03-asset-type.spec.js` | 4 |
| `e2e/04-common-form.spec.js` | 5 |
| `e2e/05-fields.spec.js` | 4 |
| `e2e/06-dropdowns.spec.js` | 5 |
| `e2e/07-email.spec.js` | 10 |
| `e2e/08-users.spec.js` | 5 |
| `e2e/09-settings.spec.js` | 6 |
| `e2e/10-reports.spec.js` | 6 |
| `e2e/11-quick-entry.spec.js` | 5 |
| `e2e/90-api-contract.spec.js` | 5 |
| `e2e/91-dynamic-form-contract.spec.js` | 7 |
| `e2e/99-logout.spec.js` | 2 |
| **total** | **73** |

Writes performed by the whole run: `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`, and one
`POST /asset-types/:id/assets` built to be rejected with `400 UNKNOWN_FIELD` (the guaranteed-safe
probe in `91`). No asset, field, dropdown, user, rule or setting was created or modified.

---

# Post-refactor run log

The refactor touched only how code is organised (modules, shared helpers, file layout). No class
name, label, message, request order or state reset was changed, and every step was re-verified
against the live dev server (`nodemon` restarted it after each backend edit; `npm --prefix client
run build` after each frontend edit).

Suites run after each stage, all green:

| Stage | Unit | E2E (Firefox) |
| --- | --- | --- |
| Baseline, before any change | 21/21 | 73 passed, headless 2.2m + headed 2.3m |
| Backend: `utils/sql.js`, shared `EMAIL_RE`, `users/service` helpers | 21/21 | 73 passed |
| Same backend set, re-run after the last module edit | 21/21 | 73 passed |
| `AssetType.jsx` split into `pages/assetType/*` + `useColumnFilters` + `assetValues` | 21/21 | 73 passed (2.2m) |
| `Reports.jsx` rewritten on the same shared helpers | 21/21 | 73 passed (2.3m) |
| `Dashboard.jsx` → `pages/dashboard/AddAssetModal.jsx` | 21/21 | 73 passed (2.2m) |
| `Settings.jsx` → `pages/settings/*Card.jsx` | 21/21 | 73 passed (2.2m) + headed 2.4m |
| Final: both XLSX exports → `utils/xlsx.js` | 21/21 | 73 passed (2.2m) |

Writes performed by every run above: login, logout and the deliberate `400 UNKNOWN_FIELD`
probe — no production row was created or changed by any run.

What the refactor removed (each duplicate collapsed to one place):

- Client: asset-value display formatting (3 copies) → `utils/assetValues.js#formatAssetValue`;
  dropdown option fetching/shaping (4 copies) → `withDropdownOptions`; the column-filter state
  machine (2 copies) → `hooks/useColumnFilters.js`; the XLSX workbook build (2 copies) →
  `utils/xlsx.js`; the byte-duplicate date module `client/src/utils.js` (46 lines) deleted,
  `utils/date.js` is now the only client date source.
- Server: `EMAIL_RE` (4 copies) → `utils/validation.js`; JSON-column parsing (4) and
  `IN (…)` placeholder building (3) → `utils/sql.js`; inside `users/service.js` the DTO mapping
  (4), the last-admin guard (2), the password rule (2) and the capability insert loop (2) each
  became one internal helper.

Sizes: biggest page `AssetType.jsx` 1022 → 469 lines (7 modules beside it); `Settings.jsx`
491 → 25 lines (6 cards); `Dashboard.jsx` 421 → 214 (modal extracted); `Reports.jsx` 106 → 415
lines, which is the same markup that was previously written one-section-per-line. Bundle:
679.71 kB / 210.43 kB gzip before → 678.65 kB / 210.19 kB gzip after.

Housekeeping: added `testing/.gitignore` so `.auth/` (stored admin session), `.artifacts/`,
`test-results/` and `playwright-report/` are never committed, and removed a stray
`client/test-results/` left by one mis-cwd Playwright invocation.

---

# Flake log — user run 2026-10-31 10:47 (headed, 71 passed / 2 failed, 3.2m)

Both failures are the suite reading too early, not the app behaving differently. No product code
was changed for either fix.

## #10 `05-fields` "the table columns match the API rows, in order" — FAILED with `[]` (fixed)

The test waited for the page heading only, then took a **single** `evaluateAll()` snapshot of
`main table thead th`. `/fields` renders the table only after its own `GET /api/v1/fields`
returns, so on a slower (headed) machine the snapshot lands on the pre-render DOM and returns an
empty list. The DOM snapshot saved with the failure proves it: `.artifacts/e2e-05-fields-…/error-context.md`
shows the table fully rendered with the 6 expected `columnheader` entries — right there, one
moment later.

Fix: replaced the one-shot read with Playwright's retrying `toHaveText([...])`, which waits for
the 6 header cells and compares the same exact strings.

## #11 `07-email` "All users switches the query to every owner" — FAILED with `requested = []` (fixed)

Trace evidence (`0-trace.trace` = test's own API calls, `2-trace.trace`/`2-trace.network` = page):

```
62418.479  Frame.check          internal:label="All users"
62583.117  Frame.expect         checkbox is checked
62594.526  Frame.expect         list count == all.length      ← passes immediately
62603.884  Frame.evaluate       () => location.origin
62638.748  page GET /api/v1/email/history/all?limit=200 → 200  ← 44 ms AFTER the assertion
```

The app did exactly what it should: the toggle re-queried `/email/history/all`. But the test
asserted on a `page.on('request')` array before that request had been issued, and its other
signal — the row count — cannot distinguish the two scopes: `/email/history?limit=200` and
`/email/history/all?limit=200` both came back with ETag `W/"17b3-ywYKP7C9FnNVwkY+xj53mRz+4GU"`,
i.e. the admin's own rows are currently every owner's rows, so `mine.length === all.length`.

Fix: the test now awaits `page.waitForRequest(... /email/history/all?limit=200)` before clicking
on, so the switch is proven by the request it must make instead of by a list that looks identical.

## #12 Same latent race in `09-settings` "the admin sees every card, in the documented order" (fixed pre-emptively)

It read `main h3` with one `evaluateAll()` after two static-text waits. While the SMTP card is
still loading it renders `<h3>SMTP</h3>` instead of `<h3>SMTP (email delivery)</h3>`, so the same
class of race could fail that test on a slow run even though it passed on 2026-10-31. Now uses
retrying `toHaveText(CARD_TITLES)`.

Audit of the other one-shot `evaluateAll()` reads: `04-common-form`, `06-dropdowns`, `08-users`,
`10-reports` and `11-quick-entry` all take their snapshot **after** a retrying assertion that
guarantees the rows/summary rendered (`toHaveCount`/`toBeVisible` on data-driven text), which is
the pattern `10-reports:65` documents. Left as they are.

Note: failure traces and DOM snapshots contain the live `sid` session cookie. They stay on this
machine only, and `testing/.gitignore` now excludes `.artifacts/`, `report/` and `.auth/`.

## #13 Headed confirmation run after the flake fixes — 5 click-dispatch timeouts, no behaviour bug

My own full **headed** Firefox run right after fixes #10-#12 (1 worker, no parallelism):
**68 passed / 5 failed, 4.8 m** — versus the usual 2.2-2.4 m, so the machine was clearly loaded.

| Test | Step that timed out |
| --- | --- |
| `04-common-form` "the Copy to users modal loads its targets and closes without copying" | `Close` in the modal |
| `05-fields` "the create-field modal offers every type and closes without writing" | `Close` in the modal |
| `05-fields` "the edit-field modal is prefilled from its row and closes without writing" | `Close` in the modal |
| `06-dropdowns` "selecting a dropdown shows exactly its stored options" | the `Status` row button |
| `07-email` "the new-template editor offers the placeholders and inserts them into the body" | a placeholder chip (`button.bg-indigo-50`) |

All five failed identically: Playwright logged *element is visible, enabled, and stable /
performing click action* and then `TimeoutError: locator.click: Timeout 12000ms exceeded`.
That is the click never being delivered, not a wrong element and not a broken page - and none of
these four pages (`CommonForm.jsx`, `Fields.jsx`, `Dropdowns.jsx`, `EmailNotifications.jsx`) were
touched by the refactor at all.

Confirmation, not guesswork: re-ran exactly those four spec files **headless** on the same build
and same data - **24 passed (41.1 s)**. The product code and the tests are fine; the headed run
lost its clicks to the environment (occluded/minimised window or CPU contention).

No app or test change. Guidance for future headed runs: keep the Firefox window visible and
un-minimised and the machine otherwise idle; gate merges on the headless `npm run test:e2e` run
and use `--headed` for the human check. If headed click timeouts keep recurring, raise
`actionTimeout` in `playwright.config.js` above 12 s - do not "fix" it by weakening an assertion.

## #14 `07-email` "the rule editor builds its pickers from the API and cancels without writing" — third occurrence of the pre-render race (fixed)

Full headless run after #10-#13: **72 passed / 1 failed (3.2 m)**. The failure was

```
- Expected 20 lines: "Bag Pack", "Bluetooth Earbuds", … (all 18 asset-type names)
+ Received  1 line : Array []
```

Root cause, from that run's own `error-context.md`: the page snapshot taken at the failure
**shows the New Rule dialog fully rendered with all 18 checkboxes**, so the app was correct and
the read was early again. `modal(page, title)` in `helpers/app.js` is a *locator factory* - it
returns immediately and waits for nothing - and the very next statement was a one-shot
`evaluateAll()`. If React has not committed the modal yet the locator matches 0 elements and
`evaluateAll()` resolves to `[]` at once instead of retrying. That is the same defect as #10 and
#12, arriving through a different door: a modal opened by a click rather than by `goto()`.

Audit of all 23 `modal(page, …)` call sites in the suite: 21 of them already start with a
retrying or auto-waiting action (`expect(dialog).toBeVisible()`, `expectLabels`, `expectValues`,
`fieldIn`, or a Playwright action like `uncheck()` that waits by itself). Two did not:

- `07-email.spec.js:227` - the one that failed → added `await expect(dialog).toBeVisible();`
- `08-users.spec.js:67` - `const labels = await controlLabels(dialog)` right after opening Add
  User, the identical latent race → same one-line guard added pre-emptively.

Fix is test-side only, and it is the convention the rest of the suite already follows rather than
a new mechanism: the modal's existence is asserted before anything is read out of it. The
assertion itself is unchanged - still the same 18 names in the API's order, so the behaviour it
locks is exactly what it locked before.

Re-ran `07-email` + `08-users`: **15 passed (25.1 s)**.

Clean baseline after the guard, same build and same data:
**unit 21 passed / 0 failed (253 ms)** and **e2e 73 passed / 0 failed (3.0 m, headless Firefox)**.

---

# Behaviour change 2026-10-31 (requested) - saving from the dashboard's Add Asset modal no longer opens the new asset

Requested change, not a bug: after "Save <type>" the app used to jump to `/assets/<publicId>`
(`Dashboard.jsx` `goToCreatedAsset`). It now closes the modal, refreshes the type grid and stays on
the dashboard; the "Asset added successfully." toast is unchanged. One handler serves every asset
type, so all 18 types changed together. `useNavigate` was dropped from `Dashboard.jsx` - it had no
other use. The asset-type page's own "+ Add Asset" (`/asset-types/:id/new`) and the in-row edit
overlay already returned to a list, so they were left as they are.

Locked by a new test: `02-dashboard` "saving an asset keeps the user on the dashboard instead of
opening the new asset". It is the suite's first submit, and it stays write-free by answering
`POST /api/v1/asset-types/<id>/assets` inside the browser with `page.route()`; it then asserts the
server saw exactly that one write and that the type's asset `total` is unchanged before and after.

Proof the test actually locks the behaviour: `Dashboard.jsx` was temporarily restored to the old
redirect and rebuilt - the test failed with
`Expected: "http://127.0.0.1:3000/"  Received: "http://127.0.0.1:3000/assets/never-written"`.
Reverted, rebuilt (`index-FTsILBqK.js`, 678,596 bytes), and the full suite is green:
**unit 21 passed / 0 failed**, **e2e 74 passed / 0 failed (3.1 m, headless Firefox)**.

---

# #15 Phone screens: oversized controls and ragged action rows - fixed (2026-10-31)

Reported from five hand-shot screenshots at 1080x2400 (360 CSS px): "button ka size bada aa raha
hai", things do not sit right, the UX does not feel professional. Diagnosed with
`scripts/mobile-audit.mjs` (a diagnostic, not a test) before touching any code: same Firefox, same
admin session, every route measured at 360x800.

Measured, in the order that mattered:

| Measurement | Before | After |
|---|---|---|
| `Logout` computed `font-size` (its class is `text-sm`) | **16px** | 14px |
| "+ Add Field" button box | **65 x 92 px, label on 3 lines** | one line |
| Horizontal page overflow, 10 routes @360 | 0px | 0px |
| Horizontal page overflow, 10 routes @320 | - | 0px |
| `/fields` table width | 736px (3 columns on screen) | 641px (4 columns) |
| `/reports` table width | 1723px | 1627px |
| Common-form row | name squeezed to 3 lines, flags overlapping it, arrows on a 3rd line | name + arrows, flags below |
| Asset-type toolbar (8 buttons) | right-aligned staircase of 8 widths | even 2-column grid |
| Dialog footer (Cancel / Save Bluetooth Earbuds) | side by side, overflowing | full width, primary on top |

**Root cause of "buttons look big"**: `client/src/index.css:6` set
`button, input, textarea, select { font: inherit; }` *outside* any cascade layer. The `font`
shorthand carries `font-size`, and an unlayered rule beats every `@layer utilities` declaration, so
`text-sm` (14px) and `text-[13px]` on controls were silently overridden to the body's 16px. That is
the `font: inherit` item from the UI-polish backlog, and it was a real defect, not cosmetics.
Fixed by moving the reset into `@layer base` (it still wins over browser defaults, now loses to
utilities). This also changed desktop rendering - for the better, and it is what the classes always
claimed: a `text-sm` button now measures 14px at every width.

Everything else is a phone-only layout rule, so the desktop pages are pixel-identical:

- `.action-bar` (`index.css`) - under 640px a toolbar's children become two equal columns.
  `min-width: min-content` rather than `0`, so a label too long for half the row takes the whole row
  instead of spilling text over the button edge (visible at 320px: "Reset password" and "Delete" go
  full width, everything else stays 2-up). Applied to `AssetType.jsx:238`, `Users.jsx:204`,
  `AssetForm.jsx` footer.
- `.dialog-actions` - under 640px a dialog footer stacks full width with the primary action on top
  (the DOM keeps Cancel first, so keyboard and screen-reader order are unchanged). 13 footers tagged.
- `Button` keeps `whitespace-nowrap` so a label can never break mid-word again.
- Tables under 640px: `padding-inline: .75rem` (was Tailwind's `px-5`), `td` `padding-block: .625rem`,
  and `th { white-space: nowrap }` - headers like "Date Of Purchase ▾" no longer stack to 5 lines.
- `CommonForm.jsx` and `assetType/FieldForm.jsx` rows: the two flag checkboxes move under the field
  name (`order-3 w-full`, restored by `sm:order-none sm:w-auto`), the arrows and Remove stay beside
  the name, and the two editors now match each other.
- `EmailHistory.jsx` filters: the status select grows to fill the row and Refresh takes its own full
  width line instead of floating orphaned at the right edge.
- `Fields.jsx` header: the title block and "+ Add Field" wrap as `flex-wrap items-start` instead of
  crushing the button.
- `settings/QuickEntryCard.jsx`: `.field-row` gives the label input its own line so the type picker,
  Required and Remove are not crushed beside it.

No behaviour, no data flow and no copy changed: only class names and one CSS file.

## Suite changes

- New `firefox-phone` project (`playwright.config.js`) - same Firefox, `viewport: 360x800`, running
  only `e2e/mobile/**`. The desktop project got `testIgnore: ['e2e/mobile/**']`.
- New `e2e/mobile/20-mobile-layout.spec.js`, 7 tests, all measurement-based (bounding boxes and
  computed styles, not snapshots): no sideways scroll and nothing outside the viewport on 10 routes;
  controls render at their class's font size; no wrapped button label; action bars are an even
  2-column grid with >=36px tap targets; the common-form row reflow; a dialog footer stacking with
  the primary action on top; headers on one line inside their own scroller. Read-only: the dialog
  test asserts `watchWrites()` stays empty.
- `04-common-form.spec.js`: the row assertions now read `label` as a descendant (the flags moved into
  a group), same count and same per-flag checks. New desktop test "a desktop row keeps name, flags
  and actions on one line" proves the phone reflow did not move anything at 1280px.
- `07-email.spec.js:230` and `03-asset-type.spec.js:32`: one-shot reads replaced with retrying
  assertions. `07-email` is the fifth sighting of the pre-render race from #10/#12/#14 (the picker
  list is filled by a request the dialog makes after it opens); `03-asset-type` failed once in a full
  run and passes standalone, and line 32 was the last unguarded `textOf()` after a `goto()` in the
  suite - audited the other seven one-shot reads and each already starts with a retrying guard
  (`toHaveCount`, `expectLabels`, `toBeVisible`). Both replacements assert the exact same ordered
  arrays, so nothing was loosened.

Evidence: `.artifacts/mobile-audit/*.png` - 10 pages at 360x800 plus `bulk-bar`,
`notification-panel`, six dialogs (`modal-*.png`) and their scrolled footers (`*-bottom.png`), and
`settings-full.png` for the whole Settings page.

Final run on `index-y4bBwtly.js` / `index-DGDerAos.css`:
**unit 21 passed / 0 failed (267 ms)**, **e2e 82 passed / 0 failed (3.9 m: 75 desktop + 7 phone)**.
Desktop re-measured at 1280x800: 0px overflow on all 10 routes, `/fields` table 974px inside 974px
(no scroll), `/asset-types/1` 974 inside 974 - i.e. the desktop tables did not grow.

## #15 follow-up: the last two pages, and action bars that shrank to islands (2026-10-31)

The sweep above stopped at the 10 nav pages. `/assets/<publicId>` and `/asset-types/<id>/new` were
measured next (the audit now resolves a real asset through `GET /asset-types/1/assets?page=1`, so it
sweeps 12 routes), and one of them was visibly wrong.

| Measurement @ 360x800 | Before | After |
|---|---|---|
| `/assets/6d9f2019…` action row | **137px wide island** under a 328px title; Edit 56px, Delete 73px | 328px row, Edit 160 + Delete 160, one line |
| `/users` admin row (2 buttons) | **256px bar, both buttons stacked** at 256px each | 294px bar, 143 + 143 side by side |
| `/asset-types/1` toolbar, "+ Add Asset" (inside a `<Link>`) | cell 161px, **button 96px** - the other seven filled 161 | cell 161, button 161 |
| `/asset-types/1/new` (full-page asset form) | 0px overflow, single column, date/quantity controls on one line | unchanged - no fix needed |
| Horizontal page overflow, 12 routes @360 and @320 | - | **0px on all 12, both widths** |
| Desktop 1280x800, same pages | Edit 56 + Delete 73 on one line at the right | byte-identical (the rules live under `max-width: 639.98px`) |

Two small CSS facts caused the first two rows, both inside `index.css`'s phone block:

- `.action-bar` was a flex *item* of a `flex-wrap justify-between` header, so when it wrapped below
  the title it shrank to its content instead of using the screen. Now `width: 100%` under 640px.
- An `<a>` does not stretch its `inline-flex` child, so a `Link`-wrapped `Button` kept its natural
  width inside a half-width cell. Now `.action-bar > a { display: flex }` and
  `.action-bar > a > button { flex: 1 1 auto }`. `AssetDetail.jsx:60` got the `action-bar` class
  (its `flex gap-2` classes were kept, so no selector or desktop layout changed).

Suite changes:

- `e2e/mobile/20-mobile-layout.spec.js` is 8 tests. The two route-loop tests now use
  `phoneRoutes(request)`, which adds `/assets/<a real publicId>` and `/asset-types/1/new` (12 routes,
  data-driven, no hardcoded id). New test "an action bar uses the whole screen, and a Link button
  fills its half" asserts bar width >= its parent's content width, button width >= its cell width,
  that the asset-type bar still contains a Link cell (so the case cannot silently stop being
  covered), and that two actions share the first line.
- `scripts/mobile-audit.mjs` prints, per page, each `.action-bar`'s width against its parent's
  content width and every cell's `cell/button` pair with its top edge - which is how the 96px button
  inside a 161px cell was found.

Proof the new test is not vacuous - each new rule was removed on its own, the client rebuilt, and the
test run again:

- `.action-bar { width: 100% }` out → failed at `20-mobile-layout.spec.js:198` (bar width).
- `.action-bar > a { display: flex }` + `> a > button { flex: 1 1 auto }` out → failed at line 204
  with `/asset-types/1: + Add Asset does not fill its cell, Expected: >= 160, Received: 96`, which is
  the real "before" number for that row of the table above.

Both rules restored, rebuilt (`index-7ZRCpAXn.css` / `index-ppyVVGHz.js` - the same hashes as the
83-test build, so the shipped CSS is byte-identical to what was verified), and everything below runs
on that build.

One full run then failed twice on transport, not on behaviour:
`99-logout` "a browser without the session cookie starts signed out" with
`page.goto: NS_ERROR_ABORT` navigating to `/`, and the phone route sweep with
`apiRequestContext.get: Timeout 12000ms exceeded` on its very first API call. Both passed standalone
(1.6s / 13.7s) and `/api/v1/health` answered in 9ms afterwards, so this is the dev server stalling
under a 4-minute run - a third environment class alongside the pre-render race (#10/#12/#14) and the
headed click-dispatch timeouts (#13). Nothing was retried, skipped or loosened. Two subsequent full
runs are clean - the first exited 0, the second reported **83 passed (3.7 m)** - plus
**unit 21 passed / 0 failed**, and the 360x800 audit was re-run as the very last step so
`.artifacts/mobile-audit/*.png` shows the 12 fixed pages at phone size.

---

## #16 `20-mobile-layout` "a dialog footer stacks its buttons full width, primary on top" - Cancel click did not close the modal (harness, hypothesis only)

Failed once in a `--project=firefox-phone` run after the two clean full runs:

```
Error: expect(locator).toHaveCount(expected) failed
Locator:  ...has: heading "Add Asset"...    Expected: 0    Received: 1    Timeout: 8000ms
```

so the Cancel click at line 268 was dispatched and the modal stayed open. The failure screenshot
(`.artifacts/e2e-mobile-20-mobile-layou-b6b77-.../test-failed-1.png`) shows a fully rendered Bag Pack
form scrolled to the top - Name, User, Date Of Issue ... Quantity, Status - with the footer below the
visible area. Not an app bug: the same dialog's Cancel works in `02-dashboard`, which passes every
time.

Hypothesis, taken from that spec's own comment: the picked type's fields arrive a request after the
type button is clicked ("Loading fields..."), the modal grows, and the footer moves down - a click
computed before that reflow lands on a form field instead. The phone test had no settle wait; the
desktop test has one. Added the same wait (`20-mobile-layout.spec.js:251`), then tried to prove it by
reproduction and **could not**: `--repeat-each=6` passed 6/6 with the wait and 6/6 without it, so the
flake is rarer than 1-in-6 and the mechanism is unproven. The wait stays because it matches the
existing convention and asserts nothing weaker than before; the incident stays logged as an open
harness item rather than a fix.

Suite state after this entry, on the same build: **unit 21 passed / 0 failed**, **e2e 83 passed /
0 failed (4.2 m)**, and the 360x800 audit re-run last: 0px horizontal overflow on all 12 routes.
(The dialog test has since passed in two more full runs - 83 and 84 tests - so #16 stays a one-off.)

---

# #17 Every page printed its own name twice below lg: - fixed (2026-10-31)

Reported from three more phone screenshots (1080x2400): "heading duplicate lag rahi hai ... sari
headings sirf header me hi aaye". Measured, not guessed: the compact header
(`Layout.jsx:71-95`, `lg:hidden`) already prints the page name, and all nine nav pages then printed it
again as their in-page `<h2>` - "Assets" under "Assets", "Reports" under "Reports", "Common Form"
under "Common Form".

| Route | Header said | Page also said |
|---|---|---|
| `/` | Assets | **Assets** (`Dashboard.jsx:87`) |
| `/reports` | Reports | **Reports** |
| `/common-form` | Common Form | **Common Form** |
| `/fields` | Field Definitions | **Field Definitions** |
| `/dropdowns` | Dropdowns | **Dropdowns** |
| `/email-notifications` | Email Notifications | **Email Notifications** |
| `/email-history` | Email History | **Email History** |
| `/users` | Users | **Users** |
| `/settings` | Settings | **Settings & Security** |

Three pages are deliberately **not** in that list, because their `<h2>` is not a duplicate: the
asset-type page (header "Asset Type", page "Bluetooth Earbuds"), the asset detail page (header "Asset
Manager", page = the type name) and the add/edit asset page (page = "Add <Type>"). Those headings
carry the record's identity, so they stay visible at every width.

Fix, phone-and-tablet only:

- The nine `<h2>`s got one extra class, `page-title`, and `index.css` gained
  `@media (max-width: 1023.98px) { .page-title { display: none } }`. The cap is exactly where the
  compact header exists (`lg` = 1024px), so the rule hides the duplicate wherever there are two names
  on screen and nowhere else. On desktop the sidebar shows no page name, so the `<h2>` is the only
  title and it is untouched.
- Only the title is hidden, not the description under it ("Choose an asset type to manage its
  records.") - that line is not a duplicate and it is the page's only hint on a phone.
- The header's page name went from a `<div>` to an `<h1>`. Without that, hiding the `<h2>` would leave
  those pages with no heading element at all for a screen reader; with it there is exactly one
  heading, the visible one. Tailwind's preflight resets `<h1>`, and the classes are unchanged, so the
  header pixel-matched before and after (`Layout.jsx:73`).

## Suite changes

- `e2e/mobile/20-mobile-layout.spec.js` is 9 tests: "the page name is printed once - in the header,
  not repeated below it" walks all nine nav routes at 360x800 and asserts `header h1` has the page
  name, `main .page-title` is still in the DOM (`toHaveCount(1)`) but hidden, and exactly **one**
  heading with that name is exposed to assistive tech.
- Desktop needed no new assertion: `01-shell-auth` "every nav item opens its page and the page keeps
  its heading" plus the nine per-page `getByRole('heading')` checks already fail if a desktop `<h2>`
  disappears - and they all still pass, which is the proof the change is width-scoped.
- The new test cannot pass without the change either: `.page-title` did not exist before it, so its
  `toHaveCount(1)` would already fail.

Measured on `index-xDwRP0mR.css` / `index-CHgRH0nH.js`: **e2e 84 passed / 0 failed (4.0 m: 75 desktop
+ 9 phone)**. Audit at three widths - 360x800, 820x1180 (tablet, where the compact header is still up)
and 1280x800 - 0px horizontal overflow on all 12 routes at each, with `dashboard.png` confirming the
duplicate is gone at 360 and 820 and the desktop page still shows its "Assets" title.

---

# #18 The asset-type toolbar spent four rows on eight actions - fixed (2026-10-31)

Reported from a 360px screenshot of `/asset-types/1`: "ye jo option hai add asset, customize column,
export xlsx inhe ek row me slider me dal do acha lagega, jagah bhi kam gharenge". The two-column phone
grid (#15) was designed when that bar held two actions; it now holds eight role-gated ones, so on a
phone it became four rows of buttons before the table even starts.

Measured at 360x800 (`/tmp/audit-before-360.log` line 64 vs `/tmp/audit-after-360.log` line 69):

| | bar | rows | button widths |
|---|---|---|---|
| before | 328px wide, ~160px tall (tops 152 / 193 / 235 / 276, each 36px) | 4 | 161px each (all equal, all half the screen) |
| after | 328x40px, content 717px | 1 (top 154) | 96 / 117 / 96 / 100 / 76 / 57 / 71 / 62px - each exactly its label width |

The 120px the row gives back is 15% of an 800px-tall phone screen.

Fix, phone only:

- `AssetType.jsx:238` gained a second class, `action-bar-scroll`, and `index.css` got its rule inside
  the existing `@media (max-width: 639.98px)` block: nowrap, `flex: 0 0 auto` children, its own
  `overflow-x: auto`.
- `justify-content: flex-start` overrides the bar's own `justify-end` on purpose: an overflowing flex
  row aligned to the end parks its first items in a left scroll dead zone no swipe can reach. The new
  test locks the computed value and then swipes to the end to prove the last action arrives.
- `scrollbar-width: none`, because the affordance is the button already cut off at the right edge
  ("Configure F…" in `.artifacts/mobile-audit/asset-type.png`), and a classic Firefox scrollbar would
  add height to a row that is meant to be one button tall.
- 2px top and bottom padding: `overflow-x: auto` makes the bar clip its own box, which would otherwise
  cut the keyboard focus outline. That is the whole difference between the 40px bar and a 36px button.
- Scope: the other two `.action-bar`s keep the grid - `/users` rows still measure 294x136px at 360, the
  asset-detail Edit+Delete pair 328x40px. Nothing changed above 640px: at 820 and 1280 the bar measures
  `wrap / flex-end / overflow-x: visible / 717x32px / 8 buttons on one right-aligned row`, identical to
  before, because `action-bar-scroll` carries no rule outside the phone block.

No behaviour moved: same eight buttons, same order, same handlers, same gating - only where they sit.

## Suite changes

- `e2e/mobile/20-mobile-layout.spec.js` is 10 tests. "the asset-type toolbar swipes sideways in one row
  instead of stacking" asserts computed `nowrap / auto / flex-start`, that the scroller itself stays
  inside the screen, that `scrollWidth (717) > clientWidth (328)` so the row is genuinely swipeable,
  that all eight children share one top edge (`rows === 1`, replacing the grid test's
  `≤ ceil(n/2)+1` for this bar), that every action is ≥40px wide and ≥36px tall, that no label is
  crushed past its own box (`scrollWidth ≤ width + 2`), that each Link-wrapped button still fills its
  cell, and that after `scrollLeft = scrollWidth` the last action's right edge is inside the viewport.
- The two-column-grid test stopped walking `/asset-types/1` (it is a different pattern now) and picked
  up the asset-detail page instead, so it still covers two routes: `/users` and `/assets/:id`.
- "an action bar uses the whole screen, and a Link button fills its half" kept every assertion and only
  lost "half" from its title, because on a swipe bar the cell width is the label width, not 50%.
- The 0px-overflow test's scroller exemption now also accepts `.action-bar-scroll`, next to the tables
  and the header nav. The page-level `scrollWidth - clientWidth === 0` assertion is untouched, so the
  exemption cannot hide a real overflow - only items inside a scroller that itself fits.
- `scripts/mobile-audit.mjs` prints each bar as `WxHpx ... swipe=scrollW>clientW`, so the swipe range
  is readable in the log instead of only in a screenshot.

Measured on `index-CzQ6EPxJ.css` / `index-DURsYz4O.js`: **unit 21 passed / 0 failed**, **e2e 85 passed /
0 failed** (75 desktop in 3.2 m + 10 phone in 58.5 s). Audit at 360x800, 320x800 and 1280x800: 0px
horizontal overflow on all 12 routes at every width.

Open judgement call for the user: Share / Rename / Delete now live one swipe away on a phone. That is
what "ek row me slider" asked for; if Delete should stay thumb-visible without a swipe, the row would
have to drop two of the eight actions into a "more" menu, which is a behaviour change, not a layout one.

