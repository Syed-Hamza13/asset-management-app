# testing/ — behaviour-lock suite

Written **before** the modularisation refactor, so that the refactor can be proven
behaviour-neutral: the same suite must be green before and after, with no test
weakened to make it pass.

Everything is for **Firefox** (`playwright.config.js` has exactly one project),
because that is the browser you run. Watch it live:

```bash
cd testing
npm ci                        # once: installs @playwright/test
npx playwright install firefox  # once
npm run test:unit             # 21 node:test cases, no browser, no network
npm run test:e2e:headed       # the Firefox windows you can watch
npm run test:e2e              # same specs, headless (used for the baseline runs)
npm run test:all              # unit + e2e
```

Before running the e2e suite:

1. The dev API must be up on `http://127.0.0.1:3000` (`npm run dev` in `server/`) — it
   also serves `client/dist`, so rebuild the client (`npm run build`) after any UI edit
   and hard-refresh, or the tests will run against a stale bundle.
2. Log in as the admin the suite expects: `TEST_ADMIN_EMAIL` / `TEST_ADMIN_PASSWORD`
   (defaults to the real admin account). `helpers/global-setup.js` signs in once through
   the API and caches the cookie in `testing/.auth/admin.json`; it reuses a still-valid
   session so the login limiter is never hit twice in a row.
3. `BASE_URL` overrides the target if the app runs elsewhere.

## How the suite stays safe on a live production database

The suite reads; it does not change anything you care about.

- **`watchWrites(page)`** records every non-`GET` call to `/api/v1` the browser makes and
  every test asserts the list is empty. A refactor that makes a page post on load fails
  here, loudly. It also auto-dismisses `window.confirm`, so an accidental Delete click
  cannot post.
- The only writes that ever happen are (a) `POST /auth/login` / `POST /auth/logout` in
  `99-logout.spec.js`, and (b) one deliberately rejected `POST /asset-types/:id/assets`
  with an unknown field key, which `validateValues()` turns into `400 UNKNOWN_FIELD`
  **before** any `INSERT` (asserted: the asset count is unchanged).
- Never clicked, on purpose: any **Save**, Settings **Test connection** / **Send test
  email** / **Clear password**, email rule **Test** (it really mails people and writes
  history), **Make admin**, **Deactivate**, **Delete**, and the guest Quick Entry
  **Submit**. Each is asserted to exist and to be enabled/disabled correctly instead.
- Every expectation is recomputed from live API responses, so staff editing the app
  between runs does not break the suite. Where that is still true only "by order of
  magnitude" (a new asset created between the browser's fetch and the test's fetch
  changes a count), the test re-reads the same endpoints and compares sets, not indexes.

## Layout

| Path | What it locks |
| --- | --- |
| `helpers/app.js` | the selectors: `modal()`, `fieldIn()`, `controlLabels()`, `columnTexts()`, `watchWrites()`, IST date helpers |
| `helpers/contract.js` | the endpoint list + `shape()` used by both the capturer and `90-api-contract` |
| `helpers/global-setup.js` | admin session, reused when still valid |
| `helpers/capture-snapshot.js` | `npm run snapshot:capture` — writes `baselines/api-contract.json` |
| `unit/*.test.js` | automation algorithm, validation messages, date helpers, source contracts (21 cases) |
| `e2e/01-shell-auth` | nav, headings, guest bounce, notification bell |
| `e2e/02-dashboard` | asset-type cards and counts, type search, the Add Asset modal, Add Asset Type modal |
| `e2e/03-asset-type` | type list, in-row edit overlay, detail page, share/rename/delete modals |
| `e2e/04-common-form` | common form fields, add/remove picker, automations, copy-to-users |
| `e2e/05-fields` | field definitions table, create/edit modals |
| `e2e/06-dropdowns` | dropdown list, option tables, create/edit modals |
| `e2e/07-email` | templates, recipients, rules, placeholder chips, email history + filters |
| `e2e/08-users` | per-row button sets, add user, permissions, reset password, display name |
| `e2e/09-settings` | branding/Turnstile/IP allowlist/Quick Entry/SMTP/change-password cards |
| `e2e/10-reports` | column union, row set, sort, per-column filter, search, Customize Columns, XLSX download |
| `e2e/11-quick-entry` | guest form fidelity, leak checks (no addresses/templates), notify picker, refusal before POST |
| `e2e/90-api-contract` | live response shapes vs `baselines/api-contract.json` |
| `e2e/91-dynamic-form-contract` | every type's create form: field order, widgets, seeded `auto_date`, rule defaults, manual edit beats rule, quantity bounds, edit form drops quantity |
| `e2e/99-logout` | session ends, 401 JSON, deep-link bounce, sign back in, refresh `.auth` |

## Working with the baseline

`baselines/api-contract.json` is the API's key-names-and-types contract. It is
compared, never regenerated automatically:

```bash
cd testing && npm run snapshot:capture
```

Re-capture only when a contract change was **intended** (a new endpoint, a renamed key).
A refactor that keeps the contract must leave the file byte-equal apart from
`capturedAt`/`base`.

## Selector facts the suite depends on (learned the hard way)

- The app's `Modal` has **no** `role="dialog"`: it is `div.fixed.inset-0.z-50` with an
  `h2` title and a `Close <title>` button; closing unmounts it. Hence `modal(page, title)`
  and `expectNoModal(page)`.
- Table headers are CSS `uppercase`, so `innerText` gives `NAME` while `textContent`
  gives `Name` — header comparisons use `textContent`.
- `Input`/`Select`/`DateInput` wrap the control in a `<label>`, so the accessible name
  carries the hint, the option text and the red ` *` marker. `fieldIn(scope, label)`
  (label `hasText` + first control) is the reliable accessor; `getByLabel(..., {exact:true})`
  only works for bare labels.
- **Firefox quirk:** a `<textarea>` inside a label gets `label + placeholder` as its
  accessible name, so exact `getByLabel` never matches it (`Notification message` on
  Settings). Use `fieldIn`.
- `toHaveValue()` rejects an array for multi-element locators → `expectValues()`/
  `expectChecked()` poll with `expect.poll`.
- `evaluateAll()` runs inside the browser, so helpers like `cleanText()` must be applied
  back in Node.
- `filter({ hasText: 'Value' })` is a case-insensitive substring match — it also matches
  `Equals value`.
- A single DOM read right after `page.goto()` sees a half-rendered SPA: every read is a
  retrying assertion (`expectLabels`, `expectValues`, `summary` visible).

## After a failure

Read the message first: every assertion carries a plain-language reason ("the automation
overwrote a manual edit", "a visitor must never see a full address"). `.artifacts/` keeps
the screenshot, `error-context.md` and a trace (`npx playwright show-trace …`) for the
last failure only; `report/index.html` keeps the full run.

Open bugs, fixed bugs and deliberate coverage gaps are in [BUG-LOG.md](./BUG-LOG.md).
