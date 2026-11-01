---
title: "02 — Architecture"
---

# System shape

One repository, three npm projects, one shared module, one MySQL database, one
deployable container.

```
Browser (React SPA, PWA)
        │  same-origin fetch, /api/v1/*, cookie: sid
        ▼
Express 5  ── helmet CSP ── CORS ── body 6mb ── session ── CSRF ── IP gate
        │
        ├── /api/v1/**  ── module controllers ── services ── SQL (mysql2 pool, 10 conns)
        ├── public routes: /health, /setup, /auth/login, /quick-entry/*, /branding/icon, /manifest.webmanifest
        └── express.static(client/dist) + SPA fallback
                    │
                    ▼
              MySQL 8  (data + sessions + migration ledger)
                    ▲
              Email worker (in-process, setInterval, MySQL GET_LOCK)
                    │
                    ▼
              SMTP server configured by the admin
```

Key properties:

- The client and the API are served from **one container**, so the browser uses
  same-origin calls; no CORS is needed in production.
- MySQL runs **outside** the app container. Nothing in the image stores state
  except the code and the built bundle — restarting or replacing the container is safe.
- Sessions live in MySQL, so a container restart does not log anybody out.
- The email worker runs inside the API process; it is guarded by a MySQL
  advisory lock, so running two containers does not double-send.

# Repository layout

| Path | Purpose |
| --- | --- |
| `client/` | React SPA. Source in `client/src`, static files in `client/public`, built output `client/dist` (gitignored). |
| `server/` | Express API. Source in `server/src`, SQL in `server/migrations`, unit tests in `server/test`. |
| `shared/` | One file: `automationRules.js`, the automation engine imported by both sides. |
| `testing/` | The behaviour-lock suite: `unit/`, `e2e/`, `e2e/mobile/`, `helpers/`, `scripts/`, `baselines/`, plus `BUG-LOG.md`. |
| `tmp-logs/` | Ad-hoc diagnostic `.mjs` scripts used while building features. Not part of any run path. |
| `backups/` | Local `mysqldump` files. Gitignored. |
| `doc/` | This documentation set: `.docx` output in `doc/`, editable Markdown sources in `doc/src`, build scripts in `doc/_build`. |
| `Dockerfile`, `.dockerignore` | Two-stage image build. |
| `docker-compose.example.yaml` | The reference production manifest. The real `docker-compose.yml` is gitignored. |
| `.github/workflows/docker-image.yml` | CI: build the image and push it to Docker Hub. |
| `README.md` | Install/deploy/feature notes (older than this set in places — see the discrepancies section). |
| `IMPLEMENTATION-PLAN.md` | The original design/review document. Historical; the shipped code supersedes it. |

Ignored by git: `node_modules/`, the three `.env` files, `client/dist/`,
`server/dist/`, `coverage/`, `*.log`, `uploads/`, `.cache/`, `.temp/`,
`docker-compose.yml`, `docker-compose.yaml`, `backups/`. Inside `testing/`:
`.auth/`, `.artifacts/`, `report/`, `test-results/`, `playwright-report/`.

# npm projects

| Project | Name | Scripts |
| --- | --- | --- |
| root | `asset-management-app` | `dev` (server + client preview through `concurrently`), `server:dev`, `client:dev`, `install:all`, `test` (delegates to the server) |
| `server/` | `asset-management-server` | `dev` (`nodemon src/server.js`), `start` (`node src/server.js`), `test` (`node --test` over `server/test/`) |
| `client/` | `asset-management-client` | `dev` (`vite`), `build` (`vite build`), `preview` (`vite preview`) |
| `testing/` | `asset-management-testing` | `test:unit`, `test:e2e`, `test:e2e:headed`, `test:all`, `snapshot:capture` |

There are no npm workspaces. The three trees are linked with `--prefix` in
scripts, and both `client` and `server` declare
`"asset-management-app": "file:.."`, which creates a symlink to the repo root.
No source file imports that package name; `shared/` is reached by relative path.
The dependency is vestigial but harmless, and the Dockerfile relies on the
relative depth it implies (see *Shared code* below).

# Backend layering

```
server/src
├── server.js          startup: runMigrations → app.listen → startEmailWorker; SIGINT/SIGTERM shutdown
├── app.js             express app, security middleware chain, public routes, static + SPA fallback
├── routes.js          /api/v1 router; per-route requireAuth / loadUser / requirePermission
├── config/
│   ├── env.js         dotenv + Zod schema; exports the single frozen env object
│   ├── db.js          mysql2 pool (10 connections, timezone 'Z'), withTransaction() helper
│   └── migrate.js     migration runner on a dedicated connection
├── middleware/        csrf, auth (requireAuth/loadUser/requirePermission/requireAdmin),
│                      rateLimit, errorHandler, ipAccess gate
├── utils/             errors (AppError), validation (field types + Zod), scope (ownership SQL),
│                      crypto (AES-256-GCM), ipList (parse/match), pagination, slug, image size
└── modules/<feature>/ controller.js + service.js (+ extra files, e.g. worker.js, enqueue.js)
```

The layering rule is consistent: **controller = HTTP** (parse body with Zod, call
service, shape the response), **service = business rules and SQL**. Modules never
import each other's controllers.

Modules (15): `assetTypes`, `assets`, `auth`, `branding`, `commonForms`,
`dropdowns`, `email`, `fields`, `ipAccess`, `notifications`, `quickEntry`,
`setup`, `smtp`, `turnstile`, `users`. Asset-type automation lives inside
`assetTypes/`, base-form automation inside `commonForms/`.

`middleware/auth.js`'s `loadUser` re-reads the user row on every request. That is
what makes these three behaviours instant rather than eventual:

- deactivating a user kills their next request (session destroyed, cookie cleared, `401`);
- changing permissions applies on the next request;
- changing role takes effect immediately (admins bypass the permission table).

# Frontend layering

```
client/src
├── main.jsx        StrictMode + BrowserRouter + AuthProvider; registers /sw.js in production only
├── App.jsx         PublicRouter (setup vs normal) + Protected route gates
├── api/client.js   one fetch wrapper + every api.* method group, CSRF handling, error object
├── context/        AuthContext (user, can(), isAdmin), ToastContext, NotificationsContext
├── components/     Layout, ui.jsx (primitives), DynamicForm, AssetForm, AutomationBuilder,
│                   Turnstile, AssetTypeIcon, NotificationBell, NotificationBanner
├── hooks/          useColumnFilters (client-side multi-value column filtering)
├── pages/          Dashboard, AssetType, AssetEditor, AssetDetail, CommonForm, Fields,
│                   Dropdowns, Reports, Users, EmailNotifications, EmailHistory, Settings,
│                   Login, Setup  + page subfolders (assetType/, dashboard/, settings/)
├── icons/          assetIcons.js — lucide keyword registry, imported lazily
└── utils/          date.js, assetValues.js, xlsx.js
```

Two conventions worth knowing before editing:

- **Permission checks are client-side only for visibility.** Every real check
  happens again on the server. `can('...')` and `isAdmin` decide what a user can
  *see*; they never grant anything.
- **Dropdown fields come back without options.** Any page that renders a form
  must call `withDropdownOptions(fields, { activeOnly })` first; forgetting it
  silently produces empty selects.

# Shared code: the automation engine

`shared/automationRules.js` is the single source of truth for rule semantics, so
the browser preview and the server write path can never disagree.

| Export | Role |
| --- | --- |
| `AUTOMATION_CONDITIONS` | `filled`, `empty`, `changed`, `equals` |
| `AUTOMATION_ACTIONS` | `set_value`, `set_today`, `clear` |
| `isFilledValue` | what counts as filled (a single space is *not*) |
| `conditionMatches` | one rule vs one value/previous pair |
| `actionValue` | the concrete value an action writes, coerced to the target type |
| `automationToday` | today as `YYYY-MM-DD` in `Asia/Kolkata` |
| `isBlockedAutoDateClear` | a rule may never wipe an `auto_date` that already holds a date |
| `applyAutomationRules` | one ordered pass; later rules see earlier writes (so rules chain) |

Import paths — these are why the Dockerfile has to place `shared/` at
`/app/shared` in **both** stages:

| Importer | Specifier |
| --- | --- |
| `client/src/components/DynamicForm.jsx` | `../../../shared/automationRules.js` |
| `server/src/modules/assets/automation.js` | `../../../../shared/automationRules.js` |
| `server/src/modules/commonForms/automationService.js` | `../../../../shared/automationRules.js` |
| tests | `server/test/`, `testing/unit/`, `testing/e2e/91-...` reach the same file |

Rule order at write time is always **common-form rules first, then asset-type
rules** (`getEffectiveAutomations`), the same order the client preview uses.

# Request lifecycle (an authenticated API call)

1. `helmet` sets CSP and the other security headers.
2. `cors` allows `FRONTEND_URL` in production (or any origin in development).
3. `express.json` parses the body with a 6 MB ceiling (branding images are data URLs).
4. `cookieParser` + `express-session` load the session row from MySQL.
5. `csrfProtection` — for non-GET requests from a signed-in session, compares
   `X-CSRF-Token` against `req.session.csrfToken` with a timing-safe compare.
6. `requireNetworkGate()` — if the whole-app IP allowlist is on and this client
   address is not listed, the request ends here with a plain `404`.
7. `/api/v1` router → `requireAuth` → `loadUser` → `requirePermission(...)`.
8. Controller validates the payload with Zod, calls a service.
9. Service runs SQL inside `withTransaction` where several writes must agree.
10. Response is wrapped as `{ success: true, data: ... }`; a thrown `AppError`
    becomes `{ success: false, error: { code, message, fields? } }`.

# Security model

| Concern | Mechanism |
| --- | --- |
| Password storage | argon2id (`argon2` 0.43), minimum length 10 |
| Session | httpOnly `sid` cookie, `sameSite=lax`, `secure` only when `FRONTEND_URL` starts with `https:`, 24 h default, MySQL store with 15-minute expiry sweep |
| CSRF | random 32-byte per-session token, `X-CSRF-Token` header, `timingSafeEqual`; skipped for safe methods and for requests with no session (public POSTs) |
| Human verification | Cloudflare Turnstile siteverify; enforced only when `NODE_ENV=production`, the stored `turnstile_enabled` flag is true, and `TURNSTILE_SECRET_KEY` is present |
| Rate limits | login 10 / 15 min per IP; Quick Entry submit 5 / 15 min; email test actions 20 / 5 min |
| Ownership | every ordinary-user query is wrapped with `ownerScope()`, so a foreign row is invisible (`404`) |
| Secrets at rest | SMTP password AES-256-GCM with a key derived from `SMTP_ENCRYPTION_KEY`; the API only ever returns `passwordConfigured` |
| Headers | helmet CSP with `'self'` plus Cloudflare hosts for script/frame/connect; `object-src 'none'`; `upgradeInsecureRequests` deliberately disabled so plain-HTTP LAN deployments work |
| Body size | 6 MB JSON limit |
| Network gate | optional IP allowlist; blocked visitors receive the same `404` shape the app uses for unknown routes |
| Input | Zod on every payload, `mysql2` prepared statements with positional placeholders (no string SQL interpolation) |

`app.set('trust proxy', 1)` is enabled, so `req.ip` (which the rate limits use)
is whatever the last hop forwarded. Nothing in front of the container has to
overwrite that header, so a visitor can put anything in it — which is why the IP
allowlist does **not** use `req.ip`. It resolves the address itself: the TCP
socket address by default, or — when `IP_ACCESS_TRUSTED_PROXIES` lists the proxy
in front of us — the right-most forwarded address that is not itself a listed
proxy. See the backend guide, "IP allowlist internals".

# PWA architecture

| Piece | Detail |
| --- | --- |
| Manifest | Not a static file. `GET /manifest.webmanifest` is generated by Express (registered *before* `express.static`) from the branding stored in `app_settings`, with the uploaded icon's real pixel dimensions plus `/icons/icon.svg` 192/512 fallbacks, `display: standalone`, theme `#0f172a` |
| Icon | `GET /api/v1/branding/icon` serves the stored data URL as raw bytes, `nosniff`, ETag/304, falling back with a 302 to `/icons/icon.svg`. Public, so the sign-in screen shows the real icon |
| Service worker | `client/public/sw.js`, cache `asset-manager-shell-v1`; precaches `/`, `/index.html`, `/manifest.webmanifest`, `/icons/icon.svg`; `skipWaiting` + `clients.claim`; **network-first** for same-origin GETs, cache only as the offline fallback |
| Registration | `main.jsx`, only when `import.meta.env.PROD` and `'serviceWorker' in navigator` |
| Install | No `beforeinstallprompt` handling — browser default install only |
| Limits | Shell caching only; no offline writes. Browsers require a secure context for SW/install, so real install testing needs HTTPS (or localhost) |

# Configuration system

`server/src/config/env.js` loads `.env` from the process working directory
(`dotenv` default) and validates `process.env` with Zod. Any missing required
variable makes the process exit at boot — the failure is loud, not silent.

Client configuration is different: `VITE_*` values are **baked in at build
time**. `VITE_API_BASE_URL` (empty = use the browser's own origin) and
`VITE_TURNSTILE_SITE_KEY` (fallback only). Everything else an operator needs to
change at runtime is server-side: database, secrets, ports, email worker, IP
enforcement. The full table is in **09**.

# Error and response model

| Situation | HTTP | Body |
| --- | --- | --- |
| Anything succeeded | 200 (201 on create) | `{ success: true, data: ... }` |
| Mutation with nothing to return | 200 | `{ success: true }` |
| Payload failed Zod | 400 | `VALIDATION_ERROR` + `error.fields` map |
| Business rejection (duplicate key, in-use field, blocked clear ...) | 400/403/409 | module-specific `code` |
| Not signed in | 401 | `UNAUTHENTICATED` |
| Missing capability / admin-only route / bad CSRF | 403 | `FORBIDDEN`, `CSRF_INVALID`, ... |
| Unknown route, or a record owned by someone else, or an allowlisted-out IP | 404 | `NOT_FOUND` |
| Rate limited | 429 | `RATE_LIMITED` |
| Unexpected | 500 | `INTERNAL_ERROR`, message `Something went wrong.` (`error.debug` added outside production) |

# Testing architecture

`testing/` is a **behaviour-lock** suite: it was written before the refactors and
its job is to prove that behaviour did not change.

| Project | Browser / viewport | Scope |
| --- | --- | --- |
| `firefox` | Desktop Firefox 1280×720 | `e2e/**/*.spec.js` except `e2e/mobile/**` — 76 tests |
| `firefox-phone` | Desktop Firefox 360×800 | `e2e/mobile/**/*.spec.js` — 11 tests |

Plus 21 unit tests in `testing/unit/` (`node --test`), and a separate runner in
`server/test/` (`npm test` at the root). `workers: 1`, `retries: 0`,
`baseURL http://127.0.0.1:3000`, storage state `testing/.auth/admin.json`,
artifacts in `.artifacts/` (wiped at the start of every run).

The suite is **read-only against a real database**: `watchWrites(page)` records
every non-GET `/api/v1` call and auto-dismisses confirm dialogs, and each test
asserts the recorded list stayed empty. Details and commands: **08**.

# Known documentation discrepancies

Flagged so a new developer does not trust the wrong file:

| Item | Reality |
| --- | --- |
| `IMPLEMENTATION-PLAN.md` header says "nothing proposed below is implemented yet" | Written before the work; the shipped code supersedes it |
| `testing/helpers/global-setup.js` and `capture-snapshot.js` | Fall back to hardcoded admin credentials for the live database. Rotate these to a dedicated test account before sharing the repository |

Three older discrepancies are now closed, so do not go looking for them: the
README uses the same `8073` port scheme as `Dockerfile` and
`docker-compose.example.yaml`; it names the shipped example file instead of a
gitignored `docker-compose.yml`; its migration paragraph states which files are
idempotent and which rely on the `schema_migrations` tracking row. The real
Turnstile site key that used to sit at the end of the README is gone — build
args belong in CI variables.
