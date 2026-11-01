---
title: "08 — Setup and Development"
---

# What you need installed

| Tool | Version used when this was written | Needed for |
| --- | --- | --- |
| Node.js | 24.x (anything on 20+ works — `express-session`, Zod 4 and Vite 7 all need a modern runtime) | running and building |
| npm | comes with Node | installing packages |
| MySQL | 8.x | the database |
| Git | any recent | cloning, and the Docker build uses `git` metadata only implicitly |
| Docker + Compose | 24+ / v2 | production-style runs; not needed for day-to-day development |
| Firefox | current | the end-to-end suite runs Firefox only |

You do **not** need Docker to develop. You do need a MySQL server you can
create a database on.

# Get the code and install

```bash
git clone <your-repo-url> asset-management-app
cd asset-management-app
npm run install:all
```

`install:all` is the only correct first command — the repo holds three npm
projects that must each get their own `node_modules`:

| Location | Script | What it runs |
| --- | --- | --- |
| root | `install:all` | `npm install` + `--prefix server install` + `--prefix client install` |
| root | `dev` | `server:dev` and `client:dev` side by side via `concurrently` |
| root | `server:dev` | `npm --prefix server run dev` (nodemon) |
| root | `client:dev` | `npm --prefix client run build` **then** `preview` |
| root | `test` | `npm --prefix server test` (`node --test`) |
| `server/` | `dev` | `nodemon src/server.js` |
| `server/` | `start` | `node src/server.js` |
| `server/` | `test` | `node --test` (runs `server/test/*.test.js`) |
| `client/` | `dev` | `vite` (HMR dev server) |
| `client/` | `build` | `vite build` → `client/dist` |
| `client/` | `preview` | `vite preview` |
| `testing/` | `test:unit`, `test:e2e`, `test:e2e:headed`, `test:all`, `snapshot:capture` | see "Test suite" |

`server/package.json` and `client/package.json` each list
`"asset-management-app": "file:.."` as a dependency. That is how `shared/` is
importable from both — do not remove it.

# Configure environment files

Two `.env.example` files exist. Copy them **in the same folder** and fill the
values; never commit the result.

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

`server/.env` — the names and what they mean are in the backend guide. The
minimum you must set to boot: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`,
`DB_PASSWORD`, `SESSION_SECRET`, `FRONTEND_URL`. Add
`SMTP_ENCRYPTION_KEY` before you save any SMTP password, and
`TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` if you want the bot check.

Generate two good secrets rather than inventing them:

```bash
node -e "console.log(require('crypto').randomBytes(36).toString('base64'))"
```

`SESSION_SECRET` must be at least 32 characters or the server refuses to start.
`SMTP_ENCRYPTION_KEY` must be at least 32 characters **and must never change
after a password is stored** — a new key makes the stored password
undecryptable, so you would have to retype it.

`client/.env` — only two variables reach the browser, and both are read at
**build** time, not runtime:

| Name | Meaning |
| --- | --- |
| `VITE_API_BASE_URL` | leave empty to use the current origin + `/api/v1`, which is right for the single-container run |
| `VITE_TURNSTILE_SITE_KEY` | baked into the bundle at build time. If you build without it, the widget cannot render — this is why the Dockerfile takes it as a build arg |

Never put a secret (DB password, session secret, Turnstile secret key, SMTP
password) in a `VITE_*` variable. Anything prefixed `VITE_` is readable in the
downloaded JavaScript.

# Create the database

Connect as a user who can create databases, then:

```sql
CREATE DATABASE asset_management
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
```

Use a **different** database name for development than the one production uses.
`utf8mb4` matters: it is what lets staff type any language into a text field.

No schema work is needed. The server creates every table itself on boot (see
"Data model and migrations").

# Run it locally

```bash
npm run dev
```

That starts:

| Process | Port | What it serves |
| --- | --- | --- |
| Express API | `3000` (from `server/.env` `PORT`) | `/api/v1/*`, plus the built client from `client/dist` |
| Vite preview | `5173`, bound to `127.0.0.1` | the **pre-built** client, proxying `/api` to `http://localhost:3000` |

Open `http://localhost:5173` and you get the setup screen, then create the
admin. After that, both URLs work; `:3000` is the one that behaves like
production because it serves the same files the container will.

Two things about this arrangement that catch people out:

1. **`npm run dev` does not hot-reload the client.** The root `client:dev`
   script is `vite build && vite preview`, so after editing any React file you
   must run `npm run build` inside `client/` and hard-refresh the browser. For
   real HMR run the two processes yourself: `npm --prefix server run dev` and
   `npm --prefix client run dev`, then open `http://localhost:5173` (the Vite
   dev server proxies `/api` the same way).
2. **The Vite server binds to `127.0.0.1` on purpose.** It has no IP allowlist
   of its own and proxies `/api` from its own loopback socket, so a phone on the
   LAN testing through `:5173` would look like `127.0.0.1` to the gated Express
   server. To test from another device, use the Express port
   (`http://<this-pc-ip>:3000`), which is also what the e2e suite does.

`HOST` in `server/.env` defaults to `0.0.0.0`, which is what makes the API
reachable from a phone on the same network.

# Point the dev server at the right database — read this first

`server/.env` decides which database your local run writes to, and there is no
confirmation prompt. In this repository the local `.env` currently points at
the **live production** database, which is convenient for reproducing office
bugs and dangerous for experiments.

Before you run anything destructive, check:

```bash
# from server/, prints only host + name, never the password
node -e "require('dotenv').config(); console.log(process.env.DB_HOST, process.env.DB_NAME)"
```

Rule of thumb for this project: reading and clicking around is fine, and the
Firefox suite is designed to be safe to run against live data (it asserts that
it performed no writes). Creating, editing or deleting records from a dev run
**is real data** if `.env` points at production. Prefer a scratch database for
feature work, and switch `.env` back when you need to reproduce something.

# Build for production

```bash
npm --prefix client run build     # -> client/dist  (hashed JS/CSS, sw.js, icon.svg)
npm --prefix server start         # serves dist + API on PORT
```

The Docker image does exactly these two steps in a build stage and then runs
`node src/server.js`. `client/dist/` is generated and gitignored — never edit
it, and never commit it. The server reads it from disk at request time, so a
stale `dist` is a stale app.

# Test suite

There are two independent test layers plus a behaviour-lock harness.

## Server unit tests

```bash
cd server && npm test        # or: npm --prefix server test  from the root
```

`node --test` with no browser, no database connection and no network. Six files,
52 cases: `automationRules.test.js` (13), `ipList.test.js` (13),
`ipAccess.test.js` (12 — the client-address resolver, including the forged
`X-Forwarded-For` cases), `branding.test.js` (6), `email.test.js` (5),
`validation.test.js` (3). These
cover the pure helpers only, so they always run — they are the fastest way to
know you did not break the automation or IP-matching logic.

## The behaviour-lock suite (`testing/`)

Built **before** the module refactor so the refactor could be proven
behaviour-neutral, and now the gate for any frontend change. Firefox only, two
projects, same browser:

| Command (from `testing/`) | What it does |
| --- | --- |
| `npm ci` | installs Playwright (once) |
| `npx playwright install firefox` | downloads the browser (once) |
| `npm run test:unit` | 21 cases in `unit/` — automation algorithm, validation messages, date helpers, source contracts. No browser, no network |
| `npm run test:e2e` | 75 desktop specs, headless |
| `npm run test:e2e:headed` | the same, in a Firefox window you can watch |
| `npx playwright test --project=firefox-phone` | the 10 phone-layout specs at 360x800 |
| `node scripts/mobile-audit.mjs 360 800 --dialogs` | diagnostic: screenshots and measures every page at phone size |
| `npm run snapshot:capture` | rewrites `baselines/api-contract.json` |

Prerequisites for `test:e2e`:

1. The API is up on `http://127.0.0.1:3000`, and it is serving a **current**
   `client/dist`. Rebuild after UI edits or the suite tests the old bundle.
2. `TEST_ADMIN_EMAIL` / `TEST_ADMIN_PASSWORD` are exported for the account the
   suite signs in as. **If they are not set, `helpers/global-setup.js` falls
   back to the real office admin credentials that are hardcoded in that file.**
   Set them explicitly, and treat that fallback as a thing to fix, not to rely
   on. Never print or commit those values.
3. `BASE_URL` overrides the target when the app runs elsewhere.

How it stays safe on a live database, and why it is worth keeping that way:

- `watchWrites(page)` records every non-`GET` call the browser makes, and each
  test asserts the list is empty. A page that starts POSTing on load fails
  loudly here. It also auto-dismisses `window.confirm`.
- The only permitted writes are login/logout in `99-logout.spec.js` and one
  deliberately invalid `POST /asset-types/:id/assets` that `validateValues()`
  rejects with `400 UNKNOWN_FIELD` before any `INSERT` (the asset count is
  asserted unchanged).
- Never clicked, by design: any **Save**, Settings "Test connection" /
  "Send test email" / "Clear password", a rule's **Test** (it really mails
  people), "Make admin", "Deactivate", "Delete", and the guest "Submit". Those
  controls are asserted to exist and to be enabled/disabled correctly instead.
- Runs are serial (`workers: 1`) and expectations are recomputed from live API
  responses, so staff using the app between runs does not break the suite.

Spec map (what each file locks): `01-shell-auth` nav/headings/guest bounce/
bell · `02-dashboard` cards, counts, search, both modals · `03-asset-type`
list, in-row edit overlay, detail page, share/rename/delete dialogs ·
`04-common-form` fields, picker, automations, copy-to-users · `05-fields` ·
`06-dropdowns` · `07-email` templates/recipients/rules/chips/history/filters ·
`08-users` per-row button sets and dialogs · `09-settings` all six cards ·
`10-reports` column union, sort, filter, search, columns, XLSX download ·
`11-quick-entry` guest fidelity and leak checks · `90-api-contract` live
shapes vs the baseline · `91-dynamic-form-contract` every type's form: order,
widgets, seeded `auto_date`, rule defaults, manual-edit-beats-rule, quantity
bounds · `99-logout` session end and deep-link bounce.

`baselines/api-contract.json` is compared, never regenerated automatically.
Re-capture only for an **intended** contract change; a neutral refactor must
leave the file byte-identical apart from `capturedAt` and `base`.

Selector facts, learned expensively — reuse the helpers instead of rediscovering
them:

- The app's `Modal` has no `role="dialog"`; it is a plain fixed overlay with an
  `h2` title and a "Close <title>" button, and closing unmounts it. Hence
  `modal(page, title)` / `expectNoModal(page)`.
- Table headers are CSS-uppercased: `innerText` gives `NAME`, `textContent`
  gives `Name`. Compare with `textContent`.
- `Input`/`Select`/`DateInput` wrap the control in a `<label>`, so the
  accessible name includes the hint, option text and the red ` *`. Use
  `fieldIn(scope, label)`. On Firefox a `<textarea>` inside a label is named
  `label + placeholder`, so exact `getByLabel` never matches it (e.g.
  "Notification message" in Settings).
- A single DOM read right after `page.goto()` sees a half-rendered SPA: every
  read must be a retrying assertion (`expectLabels`, `expectValues`).
- `filter({ hasText: 'Value' })` is a case-insensitive substring and also
  matches "Equals value".
- `evaluateAll()` runs in the browser, so text helpers must be re-applied in
  Node.

Failures: read the assertion message first (each carries a plain-language
reason), then `.artifacts/` for the last failure's screenshot,
`error-context.md` and trace (`npx playwright show-trace …`), and
`report/index.html` for the whole run. Open and closed bugs are logged in
`testing/BUG-LOG.md`. **Do not weaken an assertion to make a run pass** — if
the app changed behaviour, either the change is intended (then the spec and the
baseline are updated deliberately, together) or it is a bug.

# Code style

No formatter or linter is configured, so match the file you are editing (the
repo mixes 2-space and tab indentation). Beyond that:

| Area | Convention |
| --- | --- |
| Modules | ESM everywhere (`"type": "module"` in all three projects). Relative imports need the `.js` extension on the server |
| Server layering | `routes.js` → `modules/<x>/controller.js` → `modules/<x>/service.js`. Controllers parse and authorise, services do the SQL. Every value goes in as a `?` placeholder — never build SQL by concatenating input. `utils/sql.js` only holds two shared snippets (`inPlaceholders`, `parseJsonObject`); the queries themselves live in the service that owns the table |
| Errors | throw `AppError(status, code, message, fields?)` from `utils/errors.js`; wrap handlers in `asyncHandler` so a rejection reaches `middleware/errorHandler.js`, which formats the `{ success:false, error:{ code, message } }` envelope. Do not send error responses by hand in a service |
| Validation | a Zod schema per write body, declared **in the controller that uses it** (`z.object({...})`), and `error.issues` mapped into `400` + `error.fields` so the form can highlight inputs. `config/env.js` is itself validated with Zod at boot, so a missing variable fails fast with a named list. Field *value* rules (type, required, quantity bounds, mobile pattern) are shared in `utils/validation.js` — `validateFieldValue()`, `FIELD_TYPES`, `EMAIL_RE` |
| Naming | `snake_case` in SQL, `camelCase` in JS objects, `PascalCase` for React components; capability keys are `domain.scope_action` |
| Auth | guard in `routes.js` with `requirePermission('...')`, never inside a service; scope with `utils/scope.js` helpers so ownership is applied in one place |
| Client | one `api` method per route in `api/client.js`; pages own their state; shared primitives in `components/ui.jsx`; page-only components in `pages/<page>/` |
| Comments | explain the *why* (a constraint, a bug workaround), not the *what*. Most comments in this repo record a specific incident — keep that habit |
| React | no class components, no global store, `useToast()` only inside `Layout` |

# Recipes

## Add a migration

1. `server/migrations/017_your_change.sql` — the runner takes the next number
   in filename sort order; never reuse or renumber an existing file.
2. Write it so it is safe to run once and, where possible, safe to run twice:
   `CREATE TABLE IF NOT EXISTS`, and for `ALTER TABLE` guard with
   `information_schema` + `PREPARE`/`EXECUTE` (copy the pattern from a recent
   file) instead of a bare `ADD COLUMN`.
3. Never edit an already-applied migration. Add a new one.
4. Start the server against a **copy** of production data and confirm
   `schema_migrations` gains exactly your row and `docker logs` shows it
   applied. Then test the restart case: start it again and confirm it skips.

## Add a field type

Touch each of these; the set is complete and every one is needed:

| Place | Change |
| --- | --- |
| `server/src/utils/validation.js` | add the type to `FIELD_TYPES` and its value rule to `validateFieldValue()`; the field-definition Zod schema in `modules/fields/controller.js` also has to accept it |
| `server/src/modules/fields/service.js` | storage shape, and whether a type change can migrate to/from it |
| `shared/automationRules.js` | whether it can be a rule source/target and how `isFilledValue` reads it |
| `client/src/components/DynamicForm.jsx` | the control branch |
| `client/src/utils/assetValues.js` | `formatAssetValue` for lists, reports, detail and exports |
| `client/src/pages/Fields.jsx` | the label in the "Field Type" list |
| `client/src/pages/assetType/BulkUpdateModal.jsx` | allow or exclude it, and its value control |
| `server/test/validation.test.js` + `testing/unit/validation-and-dates.test.js` | the new rule |
| `testing/e2e/91-dynamic-form-contract.spec.js` | the widget contract |

## Add an API route

1. Controller + service in a `modules/<name>/` folder (`controller.js` exports
   named handlers; keep it thin).
2. Register in `server/src/routes.js` under a comment block, with the right
   guard: `requireAuth`/`loadUser` is already applied as router middleware, so
   you usually add `requirePermission('...')` or `requireAdmin`. Public routes
   need `requireIpAccess` if they must respect the allowlist, plus a CSRF and
   rate-limit decision.
3. Add the matching method to `client/src/api/client.js`.
4. If it must stay reachable when the allowlist is on, check the exemption list
   in `modules/ipAccess/middleware.js`.
5. Re-run `npm run snapshot:capture` only if the contract change is intended,
   and update `testing/helpers/contract.js`.

## Add a capability

1. `server/src/modules/users/capabilities.js` — add the key to the list, and to
   the default set if new users should have it.
2. Guard the routes it protects.
3. `client/src/pages/Users.jsx` — the group label list is duplicated there in
   the `CAPTION_GROUPS` array; add the key to the right group or it will not be
   tickable.
4. Gate the UI (`can('...')`) and add the route guard in `App.jsx`.
5. Update `testing/e2e/08-users.spec.js`, which asserts the per-row button
   sets.

## Add a page

The checklist is in the frontend guide: page file, `api/client.js` methods,
route in `App.jsx`, entry in the `nav` array in `Layout.jsx`, styling classes,
then a spec in `testing/`.

# Gotchas worth knowing before you debug

| Symptom | What is actually happening |
| --- | --- |
| `GET /api/v1/some-typo` returns an HTML page with status 200 | the SPA fallback matched, not your route. Unregistered `/api` paths fall through to `index.html`. Check spelling and the prefix before suspecting the handler |
| Server exits at boot with `ECONNREFUSED` | MySQL was unreachable, so it calls `process.exit(1)`. Under Docker, the restart policy retries; under nodemon it just sits until you fix `.env` |
| Boot loop with `Duplicate column name` | a migration half-applied during a power cut, so the ledger row is missing and the file re-ran. Insert the missing `schema_migrations` row by hand — see the data-model document |
| Edits to React do nothing | you are on `npm run dev`, which serves `client/dist`; rebuild the client, then hard-refresh |
| A second browser tab logs the first one out | one session row per login; the CSRF token in the first tab is now stale |
| Turnstile passes locally but fails in the container | `VITE_TURNSTILE_SITE_KEY` is a **build argument**, not runtime config — rebuild the image |
| SMTP password saves then nothing sends | `EMAIL_WORKER_ENABLED=false`, no rule matched, or `SMTP_ENCRYPTION_KEY` changed since saving (the stored blob is then undecryptable) |
| Emails never arrive on Gmail | you used the account password, not an app password |
| `docker compose logs` shows the app but a phone cannot open it | the port mapping, not `EXPOSE`, decides the host port; check `ports:` in the compose file |
| Every visitor looks like the same IP | the app sits behind a proxy (or Docker's bridge gateway) and `IP_ACCESS_TRUSTED_PROXIES` is empty, so the allowlist is comparing socket addresses. See the operations document |

# Before you call a change finished

1. `cd server && npm test` — 52 unit cases.
2. `cd testing && npm run test:unit && npm run test:e2e` (add
   `--project=firefox-phone` when anything layout-related moved).
3. `npm --prefix client run build` and click the change in a real browser at
   both desktop and 360 px widths. Report what you measured, not what you
   intended.
4. New write endpoint? Confirm an out-of-scope record answers `404`, and that a
   user without the capability answers `403`.
5. New migration? Boot once against a data copy, then boot again and confirm
   the skip.
6. No secret, token, live credential or customer data in a committed file,
   including test fixtures, screenshots and traces.
