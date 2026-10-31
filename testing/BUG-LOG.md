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
