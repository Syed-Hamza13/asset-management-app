---
title: "05 — API Reference"
---

# How to read this reference

- Every path below is relative to **`/api/v1`** unless written outside that
  prefix (`/health`, `/manifest.webmanifest`).
- **Who** is the guard chain: `public` (no session), `auth` (`requireAuth` +
  `loadUser`), `admin` (`requireAdmin`), or a capability name. An admin passes
  every capability check.
- Signed-in `POST` / `PATCH` / `PUT` / `DELETE` calls must send `X-CSRF-Token`.
- Success envelope `{ success: true, data: ... }`; errors
  `{ success: false, error: { code, message, fields? } }`.
- A record belonging to another user answers `404`, never `403`.
- Error codes below were extracted from the source (98 distinct codes); the
  cheat sheet at the end lists them by status.

# Public routes

| Method | Path | Who | Purpose | Notable errors |
| --- | --- | --- | --- | --- |
| GET | `/health` | public, **exempt from the IP gate** | liveness, `data.status = "ok"` | — |
| GET | `/setup/status` | public | `setupRequired` = true while `users` is empty | `404` if IP-gated |
| GET | `/auth/turnstile-config` | public | `{ enabled, enforce, siteKey }` for the widget | — |
| POST | `/setup` | public, CSRF skipped, Turnstile | create the one and only first admin | `403 SETUP_COMPLETED` (already done), `409 SETUP_COMPLETED`, `400 TURNSTILE_FAILED`, `400 INVALID_PASSWORD` |
| POST | `/auth/login` | public, CSRF skipped, rate limit 10 / 15 min | start a session, returns the user and a CSRF token | `401 LOGIN_FAILED`, `429 RATE_LIMITED`, `400 TURNSTILE_FAILED` |
| GET | `/quick-entry/public-config` | public | the sign-in screen's form definition; answers `enabled:false` when the caller's IP is gated | — |
| POST | `/quick-entry/submit` | public, CSRF skipped, rate limit 5 / 15 min, `requireIpAccess('quick_entry')`, Turnstile | store a submission and notify | `403 QUICK_ENTRY_DISABLED`, `400 NO_FIELDS` / `UNKNOWN_FIELD` / `REQUIRED_FIELD` / `FIELD_TOO_LONG` / `NO_RECIPIENT`, `404` when IP-blocked |
| GET | `/branding/icon` | public | favicon bytes; 302 → `/icons/icon.svg` when nothing is stored | — |
| GET | `/manifest.webmanifest` | public | generated PWA manifest | — |
| GET | `/{*splat}` | public | SPA fallback to `client/dist/index.html` | — |

# Session and profile

| Method | Path | Body / query | Returns |
| --- | --- | --- | --- |
| GET | `/auth/me` | — | `{ user: { id, email, role, displayName, mustChangePassword, permissions[] }, csrfToken }` |
| GET | `/auth/csrf` | — | `{ csrfToken }` |
| POST | `/auth/logout` | — | `{ success: true }`, session destroyed, cookie cleared |
| POST | `/auth/change-password` | `{ currentPassword, newPassword, confirmPassword }` | clears `must_change_password`; `400 INVALID_CURRENT_PASSWORD`, `400 PASSWORD_MISMATCH`, `400 INVALID_PASSWORD` |

# Users (admin only)

| Method | Path | Body | Notes |
| --- | --- | --- | --- |
| GET | `/users/capabilities` | — | `{ all: [...19], defaults: [...7] }` for the permission editor |
| GET | `/users` | — | list with permissions; admins report all capabilities |
| POST | `/users` | `{ email, password, displayName?, permissions? }` | `201`; `409 USER_EXISTS`; sets `must_change_password = 1`; `400 INVALID_EMAIL`, `400 INVALID_DISPLAY_NAME` |
| PATCH | `/users/:id` | `{ email?, displayName?, isActive? }` | `400 CANNOT_DEACTIVATE_SELF`, `404 USER_NOT_FOUND` |
| PUT | `/users/:id/permissions` | `{ permissions: string[] }` | `400 INVALID_PERMISSIONS`, `400 ADMIN_HAS_ALL` |
| POST | `/users/:id/reset-password` | `{ password }` | sets `must_change_password = 1` |
| DELETE | `/users/:id` | — | `400 CANNOT_DELETE_SELF`, `400 LAST_ADMIN` |

# Asset types

| Method | Path | Who | Notes |
| --- | --- | --- | --- |
| GET | `/asset-types` | `asset_types.view_own` | types the user owns **or** is shared with, plus their asset counts |
| POST | `/asset-types` | `asset_types.create_own` | `201`; slug derived from the name, unique per owner (`409 ASSET_TYPE_EXISTS`, `400 INVALID_NAME`) |
| GET | `/asset-types/:id` | `asset_types.view_own` | `404 ASSET_TYPE_NOT_FOUND` for foreign or missing |
| PATCH | `/asset-types/:id` | `asset_types.edit_own` | rename; `403 ASSET_TYPE_NOT_OWNED` for a foreign type |
| DELETE | `/asset-types/:id` | `asset_types.delete_own` | `409 ASSET_TYPE_IN_USE` while the type still contains assets |
| GET | `/asset-types/:id/form` | `asset_types.view_own` | ordered fields; dropdown fields arrive **without** options |
| PUT | `/asset-types/:id/form` | `asset_types.edit_own` **or** `fields.manage_own` | `{ fieldIds: [...] }` with `required` / `showInList` / order; owned common fields are attached automatically |
| GET | `/asset-types/:id/automations` | `asset_types.view_own` | rules for this type |
| POST | `/asset-types/:id/automations` | `automations.manage_own` | `201`; see the automation codes in **04** |
| DELETE | `/automations/:id` | `automations.manage_own` | `404 AUTOMATION_NOT_FOUND` |
| GET | `/asset-types/:id/shares` | admin | who can currently see this type |
| PUT | `/asset-types/:id/shares` | admin | `{ userIds: [...] }` |

# Assets

| Method | Path | Who | Body / query | Notes |
| --- | --- | --- | --- | --- |
| GET | `/asset-types/:assetTypeId/assets/form` | `assets.view_own` | — | create/edit form preview, computed with the type owner as actor |
| GET | `/asset-types/:assetTypeId/assets` | `assets.view_own` | `?page=1&pageSize=20` (clamped 1–100) | `{ items: [{ publicId, values, createdAt, updatedAt }], page, pageSize, total }`, newest first. **No** server search / sort / filter |
| POST | `/asset-types/:assetTypeId/assets` | `assets.create_own` | `{ values: {...} }` | `201`; automations then validation; `400 INVALID_VALUES` / `UNKNOWN_FIELD` / `REQUIRED_FIELD` / `INVALID_QUANTITY` / `INVALID_DROPDOWN_OPTION`; response carries `notificationsQueued` |
| PATCH | `/assets/:publicId` | `assets.edit_own` | `{ values: {...} }` | same pipeline; `404 ASSET_NOT_FOUND`; `notificationsQueued` |
| DELETE | `/assets/:publicId` | `assets.delete_own` | — | `{ success: true }` |
| PATCH | `/asset-types/:assetTypeId/assets/bulk` | `assets.bulk_own` | `{ publicIds: [1..100], values }` | `400 ASSETS_REQUIRED`, `400 INVALID_ASSETS`; per-row automations + enqueue; returns `{ updated, notificationsQueued }` |
| DELETE | `/asset-types/:assetTypeId/assets/bulk` | `assets.bulk_own` | `{ publicIds: [...] }` | `{ deleted }` |
| GET | `/assets/:publicId` | `assets.view_own` | — | full record with its type |

# Field definitions and dropdowns

| Method | Path | Who | Notes |
| --- | --- | --- | --- |
| GET | `/fields` | `fields.manage_own` **or** `asset_types.view_own` **or** `common_form.manage_own` | ordinary users only ever receive their own rows; the admin list powers the Owner column |
| POST | `/fields` | `fields.manage_own` | `201`; `409 FIELD_KEY_EXISTS`, `400 INVALID_FIELD_TYPE`, `400 DROPDOWN_REQUIRED`, `400 INVALID_FIELD_KEY` |
| GET | `/fields/:id` | same OR-list | `404 FIELD_NOT_FOUND` |
| PATCH | `/fields/:id` | `fields.manage_own` | `409 FIELD_KEY_IMMUTABLE`; type change codes below |
| POST | `/fields/:id/type-preview` | `fields.manage_own` | read-only dry run: `{ usage, migratable, issues[], rowsToMigrate, scannedRows, needsDropdown, references }` |
| DELETE | `/fields/:id` | `fields.manage_own` | soft delete; `409 FIELD_IN_USE` when still on a form |
| GET | `/dropdowns` | `dropdowns.manage_own` **or** `fields.manage_own` **or** `asset_types.view_own` | — |
| POST | `/dropdowns` | `dropdowns.manage_own` | `201`; `409 DROPDOWN_EXISTS` for a duplicate per-owner slug |
| GET | `/dropdowns/:id` | `dropdowns.manage_own` **or** `fields.manage_own` **or** `assets.view_own` | includes options |
| PATCH / DELETE | `/dropdowns/:id` | `dropdowns.manage_own` | `409 DROPDOWN_IN_USE` while a field points at it |
| POST | `/dropdowns/:id/options` | `dropdowns.manage_own` | `201`; `409 OPTION_EXISTS` for a duplicate value |
| PATCH / DELETE | `/dropdowns/:id/options/:optionId` | `dropdowns.manage_own` | `404 OPTION_NOT_FOUND`; options go inactive rather than vanish |

Type-change codes: `409 FIELD_TYPE_INCOMPATIBLE` (a stored value cannot convert,
`error.fields.issues` explains which), `409 FIELD_TYPE_IN_USE` (changing **to**
`dropdown` while attached), `409 FIELD_SOURCE_IN_USE` (swapping the dropdown
under a field in use).

# Common form

| Method | Path | Who | Notes |
| --- | --- | --- | --- |
| GET | `/common-form` | any authenticated user | fields + automations; also used by the dashboard empty state |
| PUT | `/common-form` | `common_form.manage_own` | `{ fieldIds: [...] }` — reorders and re-attaches across every owned type |
| GET | `/common-form/automations` | `common_form.manage_own` **or** `automations.manage_own` | — |
| POST | `/common-form/automations` | `automations.manage_own` | `201` |
| DELETE | `/common-form/automations/:id` | `automations.manage_own` | `404 AUTOMATION_NOT_FOUND` |
| GET | `/common-form/copy-targets` | admin | eligible = active, non-admin, and their own form still **empty** |
| POST | `/common-form/copy` | admin | `{ userIds: [1..200] }` → `{ source: { fieldCount, ruleCount }, results: [...] }`; `400 NO_COPY_TARGETS`; per-user `409 TARGET_FORM_NOT_EMPTY` / `409 TARGET_FIELD_CONFLICT`, other targets unaffected |

# Email (per-user unless marked)

| Method | Path | Who | Notes |
| --- | --- | --- | --- |
| GET | `/email/templates` | `email.templates.manage_own` **or** `email.rules.manage_own` | — |
| POST / PATCH / DELETE | `/email/templates[/:id]` | `email.templates.manage_own` | `400 UNKNOWN_PLACEHOLDER`, `400 INVALID_SUBJECT`, `400 TEMPLATE_IN_USE` on delete while a rule still uses it |
| GET / POST / PATCH / DELETE | `/email/recipients[/:id]` | `email.rules.manage_own` | `400 INVALID_EMAIL`, `404 RECIPIENT_NOT_FOUND` |
| GET / POST | `/email/rules` | `email.rules.manage_own` | many types via `assetTypeIds`, people via `recipientIds`; `400 ASSET_TYPES_REQUIRED`, `400 RECIPIENTS_REQUIRED`, `400 INVALID_TRIGGER`, `400 TRIGGER_FIELD_REQUIRED`, `400 TRIGGER_FIELD_INVALID`, `400 INVALID_CONDITION` |
| GET / PATCH / DELETE | `/email/rules/:id` | `email.rules.manage_own` | `404 RULE_NOT_FOUND` |
| POST | `/email/rules/:id/test` | `email.rules.manage_own`, rate limit 20 / 5 min | synchronous send with a `[TEST] ` subject prefix; `400 SMTP_NOT_CONFIGURED`, `400 SMTP_TEST_FAILED`, `400 RECIPIENT_INVALID` |
| GET | `/email/history` | `email.history.view_own` | own outbox rows, newest first, status filter |
| GET | `/email/history/all` | admin | every user's rows |

# Settings (admin only)

| Method | Path | Notes |
| --- | --- | --- |
| GET / PUT | `/settings/smtp` | password never returned, only `passwordConfigured`; `500 SMTP_KEY_MISSING` without a usable `SMTP_ENCRYPTION_KEY`, `500 SMTP_KEY_INVALID` after a key rotation, `400 INVALID_PORT` |
| POST | `/settings/smtp/test-connection` | rate limited 20 / 5 min |
| POST | `/settings/smtp/test-email` | `{ to }`, rate limited |
| GET / PUT | `/settings/turnstile` | runtime on/off switch, stored in `app_settings` |
| GET / PUT | `/settings/ip-access` | PUT stays reachable for a **signed-in** session even from a blocked address; `400 INVALID_IP_ENTRY`, `400 TOO_MANY_IP_ENTRIES`, `400 EMPTY_IP_ALLOWLIST` |
| GET / PUT | `/quick-entry` | full public-form configuration; `400 PICKER_NEEDS_RECIPIENTS`, `400 FIELD_TOO_LONG`, `400 UNKNOWN_FIELD` |

# Branding and notifications

| Method | Path | Who | Notes |
| --- | --- | --- | --- |
| GET | `/branding` | auth | `{ favicon, appIcon }` |
| PUT | `/branding` | `branding.manage` | `{ key, value }`; `400 INVALID_BRANDING_KEY`, `400 INVALID_BRANDING_IMAGE`; value is a data URL up to 4 000 000 characters |
| GET | `/notifications` | auth | own rows, `LIMIT 200`, `?unread=true` |
| GET | `/notifications/unread-count` | auth | `{ unread }` |
| POST | `/notifications/:id/read` | auth | `404 NOTIFICATION_NOT_FOUND` for a foreign row |
| POST | `/notifications/read-all` | auth | — |

# Status-code cheat sheet

| Status | Codes |
| --- | --- |
| 400 | `ACTION_VALUE_REQUIRED`, `ADMIN_HAS_ALL`, `ASSETS_REQUIRED`, `ASSET_TYPES_REQUIRED`, `AUTOMATION_FIELD_NOT_IN_FORM`, `CANNOT_DEACTIVATE_SELF`, `CANNOT_DELETE_SELF`, `CANNOT_DEMOTE_SELF`, `CONDITION_VALUE_REQUIRED`, `DROPDOWN_NOT_FOUND`, `DROPDOWN_REQUIRED`, `EMPTY_IP_ALLOWLIST`, `FIELD_TOO_LONG`, `INVALID_ASSETS`, `INVALID_AUTOMATION`, `INVALID_AUTOMATION_ACTION`, `INVALID_AUTOMATION_CONDITION`, `INVALID_BRANDING_IMAGE`, `INVALID_BRANDING_KEY`, `INVALID_CONDITION`, `INVALID_CURRENT_PASSWORD`, `INVALID_DISPLAY_NAME`, `INVALID_DROPDOWN_OPTION`, `INVALID_EMAIL`, `INVALID_FIELD`, `INVALID_FIELD_KEY`, `INVALID_FIELD_TYPE`, `INVALID_FIELD_VALUE`, `INVALID_ID`, `INVALID_IP_ENTRY`, `INVALID_NAME`, `INVALID_PASSWORD`, `INVALID_PERMISSIONS`, `INVALID_PORT`, `INVALID_QUANTITY`, `INVALID_RECIPIENT`, `INVALID_ROLE`, `INVALID_SUBJECT`, `INVALID_TRIGGER`, `INVALID_VALUES`, `LAST_ADMIN`, `NO_COPY_TARGETS`, `NO_FIELDS`, `NO_RECIPIENT`, `PASSWORD_MISMATCH`, `PICKER_NEEDS_RECIPIENTS`, `RECIPIENTS_REQUIRED`, `RECIPIENT_INVALID`, `REQUIRED_FIELD`, `SMTP_NOT_CONFIGURED`, `SMTP_TEST_FAILED`, `TEMPLATE_IN_USE`, `TODAY_REQUIRES_DATE`, `TOO_MANY_IP_ENTRIES`, `TRIGGER_FIELD_INVALID`, `TRIGGER_FIELD_REQUIRED`, `TURNSTILE_FAILED`, `UNKNOWN_FIELD`, `UNKNOWN_PLACEHOLDER`, `UNKNOWN_TOKEN`, `USER_NOT_FOUND`, plus `VALIDATION_ERROR` for any Zod failure |
| 401 | `UNAUTHENTICATED`, `LOGIN_FAILED` |
| 403 | `FORBIDDEN`, `CSRF_INVALID`, `SETUP_COMPLETED`, `ASSET_TYPE_NOT_OWNED`, `QUICK_ENTRY_DISABLED` |
| 404 | `NOT_FOUND` (unknown route or blocked IP) and `ASSET_NOT_FOUND`, `ASSET_TYPE_NOT_FOUND`, `AUTOMATION_NOT_FOUND`, `DROPDOWN_NOT_FOUND`, `FIELD_NOT_FOUND`, `NOTIFICATION_NOT_FOUND`, `OPTION_NOT_FOUND`, `RECIPIENT_NOT_FOUND`, `RULE_NOT_FOUND`, `TEMPLATE_NOT_FOUND`, `USER_NOT_FOUND` — all of these also cover "belongs to another user" |
| 409 | `ASSET_TYPE_EXISTS`, `ASSET_TYPE_IN_USE`, `DROPDOWN_EXISTS`, `DROPDOWN_IN_USE`, `FIELD_IN_USE`, `FIELD_KEY_EXISTS`, `FIELD_KEY_IMMUTABLE`, `FIELD_SOURCE_IN_USE`, `FIELD_TYPE_INCOMPATIBLE`, `FIELD_TYPE_IN_USE`, `OPTION_EXISTS`, `SETUP_COMPLETED`, `TARGET_FIELD_CONFLICT`, `TARGET_FORM_NOT_EMPTY`, `USER_EXISTS` |
| 429 | `RATE_LIMITED` |
| 500 | `INTERNAL_ERROR`, `SMTP_KEY_MISSING`, `SMTP_KEY_INVALID`, `SMTP_UNINITIALIZED` |

# Calling the API from your own code

1. `POST /api/v1/auth/login` with `{ email, password, turnstileToken }`. The
   `sid` cookie and a `csrfToken` come back.
2. Send the cookie on every later request and echo the token in `X-CSRF-Token`
   for unsafe methods.
3. `GET /api/v1/auth/me` at boot returns the user **and** a fresh token, so one
   call re-establishes a session after a reload.
4. Treat `404` as "not there or not yours", `401` as "session gone", `403` as
   "not allowed", `429` as "back off".
5. Nothing is versioned beyond the `/api/v1` prefix — there are no `v2` routes.
