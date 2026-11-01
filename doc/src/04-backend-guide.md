---
title: "04 — Backend Guide"
---

This document explains how the server works: startup, configuration, the request
pipeline, the permission model, each feature's rules, and the utilities to reuse
when adding code. Endpoint-by-endpoint detail is in **05 API reference**.

# Startup sequence

`server/src/server.js`

| Step | What happens | If it fails |
| --- | --- | --- |
| 1 | `import './config/env.js'` validates the environment with Zod | process exits immediately, naming the missing variable |
| 2 | `await runMigrations()` applies every un-recorded SQL file | `Startup failed: <err>` + `process.exit(1)` → Docker (`restart: unless-stopped`) retries |
| 3 | `app.listen(env.PORT, env.HOST)` — logs `API listening on http://<HOST>:<PORT>` | exit 1 |
| 4 | `startEmailWorker()` — logs `Email worker started (every <n>ms).` or `Email worker disabled by config.` | a throw here is logged, not fatal to HTTP |
| — | `SIGINT` / `SIGTERM` → `stopEmailWorker()`, `server.close()`, `pool.end()`, `exit(0)` | graceful; in-flight requests are allowed to finish |

Because step 2 precedes step 3, **no request can ever be served against a schema
that has not been migrated**. That is also why a power-cut during migration shows
up as a restarting container rather than a half-working app.

# Configuration

`server/src/config/env.js` loads `.env` from the process working directory
(under `npm --prefix server` and in the Docker image that is `server/`), then
`schema.parse(process.env)`. Everything else in the codebase imports the single
`env` object — never read `process.env` directly.

| Variable | Default | Required | Used for |
| --- | --- | --- | --- |
| `NODE_ENV` | `development` | no | also `test` / `production`. Gates Turnstile enforcement, CORS mode, error `debug` field, SW registration |
| `HOST` | `0.0.0.0` | no | listen interface |
| `PORT` | `3000` | no | listen port. In production the compose file sets `8073` |
| `FRONTEND_URL` | — | **yes** | CORS origin; `https:` prefix switches the session cookie to `secure`; must match how users actually reach the app |
| `DB_HOST` | — | **yes** | MySQL host |
| `DB_PORT` | `3306` | no | MySQL port |
| `DB_NAME` | — | **yes** | schema name |
| `DB_USER` | — | **yes** | should not be `root` |
| `DB_PASSWORD` | — | **yes** (may be an empty string) | must be present in the environment even if the value is empty |
| `SESSION_SECRET` | — | **yes**, min 32 chars | signs the `sid` cookie. Rotating it logs everyone out |
| `TURNSTILE_SITE_KEY` | `''` | no | server-side copy of the site key (the client normally gets it at runtime) |
| `TURNSTILE_SECRET_KEY` | `''` | no | siteverify secret. Turnstile is only enforced when this is set **and** `NODE_ENV=production` |
| `SESSION_MAX_AGE_MS` | `86400000` (24 h) | no | cookie lifetime, session store expiry |
| `SMTP_ENCRYPTION_KEY` | `''` | no at boot | AES-256-GCM key material; needs ≥ 32 characters, and must stay **stable** — rotating it makes the stored SMTP password unreadable |
| `EMAIL_WORKER_ENABLED` | `'true'` | no | `'false'` queues mail into the outbox but never sends |
| `EMAIL_WORKER_INTERVAL_MS` | `15000` | no | poll interval |
| `EMAIL_MAX_ATTEMPTS` | `5` | no | retry cap for transient failures |
| `IP_ACCESS_ENFORCE` | `'true'` | no | break-glass: `'false'` disables the IP gate without touching the saved allowlist |
| `IP_ACCESS_TRUSTED_PROXIES` | `''` | no | comma-separated addresses of the reverse proxies in front of the app (single addresses or CIDR). Empty = nothing proxies to us, so the allowlist reads the TCP socket address. Set it when nginx forwards traffic, otherwise every visitor looks like the proxy |

# Request pipeline (order matters)

```
helmet → cors → express.json(6mb) → cookieParser → express-session
       → csrfProtection → requireNetworkGate()  → routes
```

| Stage | Behaviour worth knowing |
| --- | --- |
| `helmet` | CSP: `default-src 'self'` plus `challenges.cloudflare.com` / `*.cloudflare.com` for script/frame/connect; `img-src 'self' data: https:`; `object-src 'none'`; `worker-src 'self' blob:`; `style-src` allows inline. `upgradeInsecureRequests` is **deliberately off** so plain-HTTP LAN serving works. COOP/`origin-agent-cluster` are only set when the browser origin is secure or localhost |
| `cors` | `origin: true` in development, otherwise exactly `FRONTEND_URL`, with `credentials: true` |
| `express.json` | 6 MB limit — branding images are base64 data URLs up to 4 000 000 characters |
| `session` | name `sid`, `resave:false`, `saveUninitialized:false`, MySQL store |
| `csrfProtection` | see below |
| `requireNetworkGate()` | whole-app IP allowlist, purpose `login` |
| `apiRouter` | `router.use(loadUser)` — every `/api/v1` route inside it has a live user |

# Authentication and session

| Piece | Detail |
| --- | --- |
| Login | `POST /api/v1/auth/login`, `loginRateLimit` (10 per 15 min per IP), email lowercased, argon2 verify, Turnstile checked first, on success the session is regenerated and a fresh CSRF token is returned |
| Passwords | argon2id, minimum 10 characters (`assertValidPassword`) |
| Cookie | `httpOnly`, `sameSite=lax`, `secure` derived from `FRONTEND_URL`, `maxAge = SESSION_MAX_AGE_MS` |
| Store | `express-mysql-session` on the app pool; expired rows swept every 15 minutes |
| `loadUser` | re-reads the user on **every** request; inactive or deleted → destroy session, `clearCookie('sid')`, `401 UNAUTHENTICATED` |
| Must-change-password | admin-created users and admin password resets set `must_change_password = 1`; `/auth/me` exposes `mustChangePassword`; the client forces `/settings` until it is changed. The first admin created during setup is **not** forced |
| CSRF | token = `crypto.randomBytes(32).toString('hex')` stored in the session, minted at login and by `GET /auth/csrf` and `GET /auth/me`; compared with `timingSafeEqual` after a length check; header `X-CSRF-Token`; skipped for `GET/HEAD/OPTIONS` and whenever the session has no `userId` (which is what makes `/setup`, `/auth/login` and `/quick-entry/submit` usable without a session) |
| Turnstile | `verifyTurnstile(token, ip)` → returns `true` when `NODE_ENV !== 'production'`, or when the stored `turnstile_enabled` flag is off; returns `false` and logs when `TURNSTILE_SECRET_KEY` is missing in production; otherwise POSTs to `https://challenges.cloudflare.com/turnstile/v0/siteverify`. `enforce = production && enabled && secretPresent`. The literal `'bypass'` the client sends is only a schema filler — the server never treats it specially outside production |
| Rate limits | login 10 / 15 min, Quick Entry submit 5 / 15 min, email test actions 20 / 5 min |

# Permissions

| Concept | Implementation |
| --- | --- |
| Roles | `users.role` ENUM `admin` / `user` |
| Capabilities | `server/src/modules/users/capabilities.js` → `ALL_CAPABILITIES` (**19**), `DEFAULT_PERMISSIONS` (**7**, "assets only") |
| Admin | implicitly holds everything: `requirePermission` short-circuits, and `listUsers` reports all capabilities for admins |
| Ordinary user | `user_permissions` rows, read by `loadUser` into `req.user.permissions` |
| Route guard | `requirePermission('a','b')` = **any** of the listed capabilities |
| Self-guards | 400 `CANNOT_DEACTIVATE_SELF`, `CANNOT_DEMOTE_SELF`, `CANNOT_DELETE_SELF`, `LAST_ADMIN`, `ADMIN_HAS_ALL` |

The 19 capabilities: `asset_types.view_own`, `asset_types.create_own`,
`asset_types.edit_own`, `asset_types.delete_own`, `assets.view_own`,
`assets.create_own`, `assets.edit_own`, `assets.delete_own`, `assets.bulk_own`,
`fields.manage_own`, `dropdowns.manage_own`, `common_form.manage_own`,
`automations.manage_own`, `reports.view_own`, `reports.export_own`,
`branding.manage`, `email.templates.manage_own`, `email.rules.manage_own`,
`email.history.view_own`.

New users get: `asset_types.view_own`, `assets.view_own`, `assets.create_own`,
`assets.edit_own`, `assets.delete_own`, `assets.bulk_own`, `reports.view_own`.

## Ownership scoping

`server/src/utils/scope.js` is the whole privacy model in three helpers:

| Helper | Effect |
| --- | --- |
| `ownerScope(actor, column)` | returns `''` for an admin, otherwise ` AND <column> = ?` bound to `actor.id` |
| `accessibleTypesSql(actor)` | types the user owns **or** that appear in `asset_type_shares` |
| `assetAccessSql(actor)` | the above **plus** any asset the user personally created |

Status-code behaviour, which is a deliberate design choice:

| Case | Result |
| --- | --- |
| Reading another user's record | `404` + `<MODULE>_NOT_FOUND` — a foreign row simply does not exist |
| Structural edit of a type you do not own (`rename`, `delete`, `saveForm`) | `403 ASSET_TYPE_NOT_OWNED` |
| Missing capability | `403 FORBIDDEN` |
| Non-admin on an admin route | `403 FORBIDDEN` |

## Owner-actor substitution

When an admin or a sharee writes to an asset type owned by somebody else,
`resolveActorForType()` runs the *type owner's* configuration for that write:
common-form attachment, automation application and email enqueue all use the
owner's rows. The stored `assets.owner_user_id`, however, is the **actual actor**.
`getAssetForm()` uses the same substitution so the form the client previews is
the form the server will apply.

# Field types and validation

`server/src/utils/validation.js` is the only place field semantics live.

| Type | Stored as | Rule |
| --- | --- | --- |
| `text` | string | ≤ 5000 characters |
| `multiline` | string | ≤ 20000 characters |
| `number` | number | must be finite |
| `quantity` | integer | **1–15** (`INVALID_QUANTITY`) |
| `boolean` | boolean | `true` / `false` (blank means "not answered") |
| `date` | `YYYY-MM-DD` | must be a real calendar date |
| `auto_date` | `YYYY-MM-DD` | validated exactly like `date`; the difference is behaviour, not format |
| `dropdown` | option `value` string | must be an **active** option of the linked dropdown (`INVALID_DROPDOWN_OPTION`) |
| `mobile` | string | `/^\+?[0-9\s-]{7,20}$/` and 10–15 digits |

Field keys are slugs unique per owner, created on insert and then **immutable**
(`409 FIELD_KEY_IMMUTABLE`). Deleting a field is a soft delete; if it is still on
any form the answer is `409 FIELD_IN_USE`.

## `auto_date` behaviour

| Rule | Where enforced |
| --- | --- |
| Empty `auto_date` fields are prefilled with today's IST date **when a create form loads** | client, `DynamicForm.jsx`, one pass only, `isNew` only |
| Re-opening a record for **edit** never re-seeds | client |
| A user who deliberately clears the value keeps it cleared — the server never backfills | both; `isBlockedAutoDateClear` also stops any `clear` rule from wiping a filled `auto_date` |
| The server validates it like any other date and stores what it is sent | `validateFieldValue` |

# Automation rules

Stored per asset type in `asset_automations`, per base form in
`common_form_automations`; both validate against the shared contract:

| Check | Error code |
| --- | --- |
| `condition` must be one of `filled`, `empty`, `changed`, `equals` | `400 INVALID_AUTOMATION_CONDITION` |
| `action` must be one of `set_value`, `set_today`, `clear` | `400 INVALID_AUTOMATION_ACTION` |
| Source and target must both be fields on this form | `400 AUTOMATION_FIELD_NOT_IN_FORM` |
| `equals` requires a condition value | `400 CONDITION_VALUE_REQUIRED` |
| `set_value` requires an action value | `400 ACTION_VALUE_REQUIRED` |
| `set_today` may only target a `date` / `auto_date` field | `400 TODAY_REQUIRES_DATE` |
| Anything else structurally wrong with the rule | `400 INVALID_AUTOMATION` |
| `set_value` on the source field itself | blocked |
| Deleting a rule that is not yours / does not exist | `404 AUTOMATION_NOT_FOUND` |

Evaluation: `applyAutomationRules(rules, values, previous)` makes **one ordered
pass**, and later rules see values written by earlier ones, so rules chain.
Order is always common-form rules, then asset-type rules. `changed` compares the
new value with the previous stored value as strings; `filled`/`empty` use
`isFilledValue`, where a single space counts as **not** filled.

# The asset write path

```
POST/PATCH asset
  → withTransaction
      1. resolve actor for the type (owner substitution)
      2. load form + effective automations
      3. applyAutomationRules(values, previous)        ← same code as the browser
      4. validateFieldValue for every field on the form
      5. write assets.values_json (+ public_id on create)
      6. email enqueueForCreate / enqueueForUpdate      ← outbox rows in the SAME transaction
  → response, including notificationsQueued
```

Two properties follow from step 6: an asset is never saved without its
notification, and saving never fails because SMTP was down (the row just sits in
the outbox until the worker can deliver it).

`notificationsQueued` counts **emails**, not bell notifications — the name is
historical.

Bulk update (`PATCH /asset-types/:id/assets/bulk`, 1–100 ids) validates that
every id belongs to the type under scope (`400 INVALID_ASSETS`) and then loops
the single-record path, so automations and email rules run per row exactly as
they would interactively.

# Field type change

Changing a field's type rewrites stored data, so it is a two-call protocol:

1. `POST /fields/:id/type-preview` — read-only. Scans every owning user's asset
   values (`scanMigration`), coercing and validating under the new type, and
   returns `{ change, from, to, usage, migratable, issues[], issueCount,
   rowsToMigrate, scannedRows, needsDropdown, references }`. `references` counts
   automation rules, email rules and templates that use `{{field.<key>}}`.
2. `PATCH /fields/:id` with the new type — inside a transaction, rewrites
   `field_definitions` and each affected `assets.values_json`.

| Situation | Result |
| --- | --- |
| Any stored value cannot convert | `409 FIELD_TYPE_INCOMPATIBLE` + `error.fields.issues` |
| Changing **to** `dropdown` while the field is in use | `409 FIELD_TYPE_IN_USE` (remove from forms first, set the dropdown, re-add) |
| Changing only the dropdown **source** while in use | `409 FIELD_SOURCE_IN_USE` |
| Empty / blank stored values | left untouched |

# Email subsystem

## Configuration

One row in `smtp_settings`. The password is `iv:tag:ciphertext` in base64,
AES-256-GCM, key = `sha256(SMTP_ENCRYPTION_KEY)`; a missing or shorter-than-32
key gives `500 SMTP_KEY_MISSING` at save time, and **rotating** the key later
gives `500 SMTP_KEY_INVALID` the moment the stored password has to be decrypted
(re-enter the password after any key change). Every read returns only
`{ host, port, secure, username, fromEmail, fromName, replyTo, enabled,
passwordConfigured, configured }` — the password is **never** serialized.
Sending `password: null` or `''` clears it. `configured` means "host and
from_email are set", which is what the UI badge and the worker check.
Related codes: `400 SMTP_NOT_CONFIGURED`, `400 SMTP_TEST_FAILED`,
`500 SMTP_UNINITIALIZED`.

## Rule semantics

| Trigger | Fires when |
| --- | --- |
| `asset_created` | a record is created (every such rule for the owner and type) |
| `field_changed` | on create: the condition already holds on the new values (previous = undefined); on update: the trigger field actually changed to a matching value |

`trigger_condition` is `any_change`, `equals`, `not_equals`, `filled` or `empty`,
with `trigger_condition_value` used by the two comparison forms. A **no-op is
suppressed first**: if the value did not change, nothing fires, whatever the
condition says. Rules with no active recipients are skipped.

Placeholders, exactly (unknown tokens are rejected at save with
`400 UNKNOWN_PLACEHOLDER`):

| Token | Value |
| --- | --- |
| `{{asset_type_name}}` | the type's name |
| `{{asset_public_id}}` | the record UUID |
| `{{created_at}}`, `{{updated_at}}` | timestamps |
| `{{user.email}}`, `{{user.name}}` | the acting user |
| `{{field.<key>}}` | the field value |
| `{{field.<key>.previous}` | the previous value, for change rules |

Rendering is plain text and verbatim — no HTML, no auto-escaping.

## Delivery worker

`server/src/modules/email/worker.js`, inside the API process:

| Aspect | Value |
| --- | --- |
| Enabled by | `EMAIL_WORKER_ENABLED === 'true'` |
| Cadence | `setInterval(tick, EMAIL_WORKER_INTERVAL_MS)` + one immediate tick; the timer is `unref()`'d |
| Mutual exclusion | `SELECT GET_LOCK('asset_email_worker', 0)`; a process that cannot take the lock skips the tick. This is what makes running two containers safe |
| Batch | 20 due rows per tick (`next_attempt_at <= NOW()`) |
| Claim | `UPDATE ... SET status='sending', attempts = attempts + 1 WHERE status='pending'` — status-guarded, so a lost race is harmless |
| Success | `status='sent'`, `sent_at=NOW()` |
| Permanent failure | `status='failed'` immediately. Codes `EAUTH`, `EENVELOPE`, `EINVALID`, `EMESSAGE`, `ENOAUTH`, any SMTP response code ≥ 500, or a message containing `invalid recipient`, `relay` or `authentication` |
| Transient failure | backoff `min(30 × 2^(attempts−1), 3600)` seconds; after `EMAIL_MAX_ATTEMPTS` → `failed` |
| SMTP not configured | row returns to `pending` with `attempts` decremented, so configuration time is not charged as a retry |
| Error text | `sanitize()` masks `pass(word)=…` and truncates to 500 characters before it reaches `last_error` |

The outbox doubles as the delivery history that `GET /email/history` (own rows)
and `GET /email/history/all` (admin) read. `POST /email/rules/:id/test` renders a
sample payload and sends it synchronously with a `[TEST] ` subject prefix.

# Quick Entry internals

| Aspect | Behaviour |
| --- | --- |
| Storage | one `quick_entries` row holding a labelled snapshot + `submitter_ip`, plus one `notifications` row per recipient |
| Does **not** create | an asset, an asset type, a field, or any `email_outbox` row |
| Guards | `quickEntryRateLimit` (5 / 15 min), `requireIpAccess('quick_entry')`, Turnstile (`400 TURNSTILE_FAILED`) |
| Field cap | 15 fields; label ≤ 200 chars; `text` value ≤ 200, `multiline` ≤ 2000 |
| Disabled switch | `403 QUICK_ENTRY_DISABLED` |
| Notify pool | `quick_entry_recipients`, insert-time filtered to active users. `notify_picker` off → everyone in the pool is notified; on → the submitter's choice is intersected with the pool, empty intersection is `400 NO_RECIPIENT` |
| Response | `{ id, notified: <recipient count> }` |
| Templates | `notify_title` / `notify_body` support `{Field Label}` and `{all}`; `{all}` expands to one `Label: value` line per filled field; unknown tokens are rejected at save (`400 UNKNOWN_TOKEN`). With no template the title falls back to `New entry: <first answered field>` |
| Public config | `{ enabled, title, subtitle, fields[], notifyPicker, selectable[] }`; when the caller's IP is gated it reports `enabled: false` so the card hides itself without teaching the client anything about the allowlist |

# In-app notifications

| Endpoint | Semantics |
| --- | --- |
| `GET /notifications` | own rows, `LIMIT 200`, `?unread=true` supported |
| `GET /notifications/unread-count` | `{ unread }` |
| `POST /notifications/:id/read` | own row only, foreign id → `404` |
| `POST /notifications/read-all` | marks all own unread rows read |

The client polls the unread count every 60 s and marks read optimistically.
Today **only Quick Entry** writes these rows.

# IP allowlist internals

| Aspect | Detail |
| --- | --- |
| Storage | `app_settings`: `ip_access_login_enabled`, `ip_access_quick_entry_enabled` (both seeded `'false'`), `ip_access_list` |
| Entry formats | single address (IPv4/IPv6), CIDR, `from-to` range, trailing wildcard `192.168.7.*`; separated by newline, comma or semicolon; each normalised to `{family, start, end}` BigInt ranges |
| Limit | `MAX_ENTRIES = 200`; invalid entries are rejected at save with the offending line quoted (`400 INVALID_IP_ENTRY`) |
| Address used | `clientIp(req)` → `resolveClientIp(req, trustedProxies)` in `modules/ipAccess/service.js`. **Empty `IP_ACCESS_TRUSTED_PROXIES` (default):** the TCP socket address, IPv4-mapped unwrapped, forwarded headers ignored — the pre-proxy behaviour, unchanged. **List set and the socket peer is in it:** `X-Forwarded-For` is scanned **right-to-left** and the first address that is not a trusted proxy wins (`X-Real-IP` next, socket last). A proxy that appends (`$proxy_add_x_forwarded_for`) always writes the honest peer on the right, so a header the visitor forged sits further left and is never used. A peer that is *not* listed keeps the socket address, which is why a direct hit on the container port cannot be spoofed into the allowlist. `app.set('trust proxy', 1)` is left alone, so rate limits, sessions and cookies behave exactly as before |
| **Fail-open** | a block needs: enforcement on in env **and** the switch enabled **and** at least one valid entry **and** a readable client address. Otherwise access is allowed and the reason is logged (`disabled-by-env`, `not-enabled`, `no-valid-entries`, `unknown-client-ip`). Unparsable `IP_ACCESS_TRUSTED_PROXIES` entries are dropped with one start-up warning |
| Blocked response | `404`. `GET` with `Accept: text/html` → a standalone page whose only content is a large centred `404` (no bundle, no links, no service worker); anything else → the same JSON the app returns for unknown routes. The real reason and the caller's address go only to the server log |
| Exemptions | `/health` always; `GET/PUT /api/v1/settings/ip-access` **for an already signed-in session**, so a lockout can be repaired from inside |
| Break-glass | `IP_ACCESS_ENFORCE=false` in the environment + recreate the container. The allowlist keeps saving but is not applied |
| Admin view | `{ loginEnabled, quickEntryEnabled, list, entries[], invalid[], entryCount, invalidCount, maxEntries, yourIp, yourIpAllowed, enforced }` — `yourIp` is the resolved address shown as "IP the server sees for you", so it is the line to check first when the gate looks wrong |
| Reverse proxy caveat | behind nginx the socket peer is the proxy (or Docker's bridge gateway `172.17.0.1` when the userland proxy is on). Listing those addresses is what makes per-device entries match again. If the proxy forwards **no** usable chain the gate falls back to the proxy address — safe, but the restriction still cannot tell visitors apart, so read `yourIp` from a second device before switching on |
| Dev server caveat | the Vite dev server has no allowlist and proxies `/api` from its own loopback, so anyone reaching it looks like `127.0.0.1` to Express. That is why it is bound to `127.0.0.1` |

# Branding, icon and manifest

| Aspect | Detail |
| --- | --- |
| Save | `PUT /api/v1/branding` with `{ key: 'favicon_data_url' \| 'app_icon_data_url', value }`; the value must be a `data:image/(png|jpeg|gif|webp|svg+xml);base64,…` string ≤ 4 000 000 characters. Errors: `INVALID_BRANDING_KEY`, `INVALID_BRANDING_IMAGE`. The client additionally refuses anything over 2 MB |
| Read | `GET /api/v1/branding` → `{ favicon, appIcon }` (authenticated) |
| Icon | `GET /api/v1/branding/icon` — public; decodes the stored favicon, answers with real bytes, `X-Content-Type-Options: nosniff`, a restrictive CSP, ETag/304; 302 to `/icons/icon.svg` when nothing is stored |
| Manifest | `GET /manifest.webmanifest` — public, registered **before** `express.static`, generated from the stored branding with the icon's real pixel size (measured by `utils/imageSize.js`) plus 192/512 SVG fallbacks, `Cache-Control: no-cache` |

# Utilities to reuse

| File | Exports | Notes |
| --- | --- | --- |
| `utils/errors.js` | `AppError(status, code, message, fields?)` | the only way to set a non-2xx status from a service |
| `utils/validation.js` | `FIELD_TYPES`, `validateFieldValue`, `assertValidPassword`, `slug` helpers | extend here when adding a field type |
| `utils/scope.js` | `ownerScope`, `accessibleTypesSql`, `assetAccessSql` | never hand-write ownership SQL |
| `utils/crypto.js` | encrypt / decrypt (AES-256-GCM) | used for the SMTP password |
| `utils/ipList.js` | parse + match allowlist entries | BigInt ranges |
| `utils/pagination.js` | `page` / `pageSize` normalisation | list defaults 20, clamped 1–100 |
| `config/db.js` | `pool`, `withTransaction(fn)` | pool: 10 connections, `waitForConnections`, `queueLimit 0`, `timezone 'Z'`, positional placeholders only. `multipleStatements` is **not** on the pool — only on the migration connection |
| `middleware/errorHandler.js` | `errorHandler`, `notFound` | maps `AppError`, Zod issues and surprises onto the envelope |

# Response and error conventions

```json
{ "success": true, "data": { "...": "..." } }
```

```json
{ "success": false,
  "error": { "code": "VALIDATION_ERROR",
             "message": "Invalid request payload.",
             "fields": { "values.serial_no": "Required" } } }
```

- Creates answer `201`; deletes and no-payload mutations answer
  `200 { success: true }`.
- A non-`AppError` throw becomes `500 INTERNAL_ERROR` with the message
  `Something went wrong.`; outside production an extra `error.debug` carries the
  real message, and anything ≥ 500 is logged.
- `notFound` is the terminal handler after the SPA fallback, so an unregistered
  `/api/...` path returns `404 NOT_FOUND` only when it is *below* the API router;
  a path Express never matched falls into the SPA catch-all first and answers
  `200` with HTML (logged as BUG-LOG #2, intentionally kept).
- SQL is always parameterised with positional `?` placeholders — there is no
  string interpolation anywhere in the query path.
