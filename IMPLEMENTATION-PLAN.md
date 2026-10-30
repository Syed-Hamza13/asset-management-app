# Asset Management App — Architecture Review, Bug Diagnosis, and Extension Plan

## 0. Purpose and status of this document

This is a **read-only** architecture and scope review of the current React + Express + MySQL asset-management application. It captures:

1. A snapshot of the current architecture (frontend, backend, database, auth, deployment).
2. Code-level diagnosis of the two reported bugs.
3. Scope and design direction for the two requested extensions: **multi-user with permissions and per-user customization**, and **global SMTP with per-user email notification rules, templates, history, and toasts**.
4. A phased implementation plan with acceptance criteria and a cross-cutting test plan.
5. Risks and decisions that must be resolved before implementation begins.

**No application code, database schema, configuration, or existing documentation was changed as part of this review.** This file is the only intended deliverable. Nothing proposed below is implemented yet.

---

## 1. Current application at a glance

### 1.1 Tech stack

- **Frontend:** React 19, Vite 7, React Router 7, Tailwind CSS 4, `xlsx` for client-side Excel export.
- **Backend:** Node.js (ESM), Express 5, `mysql2/promise`, Zod for request validation, `argon2` for password hashing, `express-session` with `express-mysql-session` store, `helmet`, `cors`, `cookie-parser`, `express-rate-limit`, Cloudflare Turnstile for login/setup verification.
- **Database:** MySQL (InnoDB). Numbered SQL migrations under [server/migrations](./server/migrations) are applied automatically at server startup by [runMigrations](./server/src/config/migrate.js).
- **Deployment:** Single-container Docker image. Express serves the built React bundle from `client/dist` and exposes the API under `/api/v1`. See [Dockerfile](./Dockerfile) and [docker-compose.example.yaml](./docker-compose.example.yaml).

### 1.2 Identity and security model today

- A **single admin account** is created once through the first-time setup flow ([setup/controller.js](./server/src/modules/setup/controller.js), [Setup.jsx](./client/src/pages/Setup.jsx)). `createAdmin` in [auth/service.js](./server/src/modules/auth/service.js) refuses to create a second user.
- Login is email + password + Turnstile token, rate-limited by [loginRateLimit](./server/src/middleware/rateLimit.js). Session cookie `sid` is HTTP-only, `sameSite=lax`, secure when `FRONTEND_URL` is HTTPS.
- CSRF protection is a session-bound token compared with `crypto.timingSafeEqual` in [csrf.js](./server/src/middleware/csrf.js); the client sends it as `X-CSRF-Token` from [api/client.js](./client/src/api/client.js).
- [requireAuth](./server/src/middleware/auth.js) only checks `req.session.userId`. **There is no role check, no ownership check, and no per-resource authorization anywhere in the API.**
- Session payload contains only `userId`, `email`, and `csrfToken`. No role, no permissions, no scopes.

### 1.3 Functional areas that already work

- **Asset types** CRUD ([assetTypes/service.js](./server/src/modules/assetTypes/service.js), [AssetType.jsx](./client/src/pages/AssetType.jsx)).
- **Field definitions** CRUD with type validation and key immutability ([fields/service.js](./server/src/modules/fields/service.js), [Fields.jsx](./client/src/pages/Fields.jsx)).
- **Dropdowns and dropdown options** CRUD; option rename cascades into `assets.values_json`, `asset_automations`, and `common_form_automations` ([dropdowns/service.js](./server/src/modules/dropdowns/service.js), [Dropdowns.jsx](./client/src/pages/Dropdowns.jsx)).
- **Per-asset-type form configuration** (which fields appear, required flag, show-in-list flag, ordering) via [saveForm](./server/src/modules/assetTypes/service.js).
- **A single global Common Form** with its own fields and ordering. Saving it re-syncs every asset type's fields and ordering through [syncCommonFieldOrder](./server/src/modules/commonForms/service.js).
- **Automations** in two families:
  - Per-asset-type rules in `asset_automations` ([assets/automation.js](./server/src/modules/assets/automation.js)).
  - Common-form rules in `common_form_automations` ([commonForms/automationService.js](./server/src/modules/commonForms/automationService.js)).
  - Conditions: `filled`, `empty`, `changed`, `equals`. Actions: `set_value`, `set_today`.
  - Rules are evaluated **only on the server, only inside `createAsset` and `updateAsset`**.
- **Asset list page** per asset type with Excel-style column filters, bulk update, bulk delete, XLSX export, column customization ([AssetType.jsx](./client/src/pages/AssetType.jsx)).
- **Reports page** that aggregates every asset type and every asset into one filterable, sortable, exportable table ([Reports.jsx](./client/src/pages/Reports.jsx)).
- **Branding** (favicon and app icon as data URLs) stored in `app_settings` ([branding/service.js](./server/src/modules/branding/service.js), [Settings.jsx](./client/src/pages/Settings.jsx)).
- **Password change** with forced re-login ([auth/controller.js](./server/src/modules/auth/controller.js)).

### 1.4 What does NOT exist today

- No second user, no roles, no permissions, no ownership columns on any table.
- No SMTP configuration, no mail transport dependency (`nodemailer` or equivalent is absent from [server/package.json](./server/package.json)), no email templates, no notification rules, no outbox/queue, no delivery worker, no email history.
- No live (client-side) automation evaluation in [DynamicForm.jsx](./client/src/components/DynamicForm.jsx).
- No audit log, no per-user preferences, no per-user reports.

---

## 2. Data model snapshot

All tables are InnoDB. None of them carry an owner/user column today.

| Table | Purpose | Notes |
|---|---|---|
| `users` | Login accounts | Only `id`, `email`, `password_hash`, timestamps. No role, no status. |
| `asset_types` | Asset categories | `slug` is **globally UNIQUE**. |
| `dropdowns` | Reusable option sets | `slug` is **globally UNIQUE**. |
| `dropdown_options` | Options for a dropdown | Unique on `(dropdown_id, value)`. |
| `field_definitions` | Reusable field metadata | `key` is **globally UNIQUE**. `type` ∈ {text, multiline, number, boolean, date, auto_date, dropdown, quantity}. |
| `asset_type_fields` | Which fields belong to which asset type | Unique on `(asset_type_id, field_definition_id)`. Carries `required`, `show_in_list`, `display_order`. |
| `assets` | Actual asset records | `public_id` (UUID) is the external identifier. `values_json` holds field-key → value map. |
| `asset_automations` | Per-asset-type rules | FKs to `asset_types`, `field_definitions` (source and target). |
| `common_forms` | Single global common form | `id TINYINT UNSIGNED PRIMARY KEY` (not auto-increment). Seeded with `id=1`. |
| `common_form_fields` | Fields on the common form | FK to `common_forms` and `field_definitions`. |
| `common_form_automations` | Rules on the common form | Same shape as `asset_automations`. |
| `app_settings` | Global key/value settings | Currently only `favicon_data_url` and `app_icon_data_url`. |
| `schema_migrations` | Migration tracking | Managed by [migrate.js](./server/src/config/migrate.js). |
| `sessions` | express-session store | Created by `express-mysql-session`. |

Migrations live in [server/migrations](./server/migrations): `001_initial.sql`, `002_automations.sql`, `003_common_form.sql`, `004_common_form_automations.sql`, `005_branding.sql`, `999_add_asset_list_columns.sql`. They run in filename order on every server start.

---

## 3. API surface snapshot

All routes below are mounted under `/api/v1` and protected by `requireAuth` only. Source: [routes.js](./server/src/routes.js) and [app.js](./server/src/app.js).

- `GET /health` (public)
- `GET /api/v1/setup/status`, `POST /api/v1/setup` (public, one-time)
- `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`, `GET /api/v1/auth/me`, `GET /api/v1/auth/csrf`, `POST /api/v1/auth/change-password`
- `GET|PUT /api/v1/branding` (auth), `GET /api/v1/branding/icon` and `GET /manifest.webmanifest` (public: raw favicon bytes plus a generated web app manifest, so the tab and install/home-screen icons are correct on the sign-in screen too)
- `GET|PUT /api/v1/common-form`
- `GET|POST /api/v1/common-form/automations`, `DELETE /api/v1/common-form/automations/:id`
- `GET|POST /api/v1/asset-types`, `GET|PATCH|DELETE /api/v1/asset-types/:id`
- `GET|PUT /api/v1/asset-types/:id/form`
- `GET|POST /api/v1/asset-types/:assetTypeId/automations`, `DELETE /api/v1/automations/:id`
- `GET|POST /api/v1/fields`, `GET|PATCH|DELETE /api/v1/fields/:id`
- `GET|POST /api/v1/dropdowns`, `GET|PATCH|DELETE /api/v1/dropdowns/:id`
- `POST /api/v1/dropdowns/:id/options`, `PATCH|DELETE /api/v1/dropdowns/:id/options/:optionId`
- `GET /api/v1/asset-types/:assetTypeId/assets/form`
- `GET|POST /api/v1/asset-types/:assetTypeId/assets`
- `PATCH|DELETE /api/v1/asset-types/:assetTypeId/assets/bulk`
- `GET|PATCH|DELETE /api/v1/assets/:publicId`

Every one of these endpoints currently returns or mutates **global** data. There is no scoping by user, no role gating, and no ownership check.

---

## 4. Frontend surface snapshot

Routes are declared in [App.jsx](./client/src/App.jsx). Navigation is in [Layout.jsx](./client/src/components/Layout.jsx).

- `/` → [Dashboard.jsx](./client/src/pages/Dashboard.jsx): lists asset types, "+ Add Asset" modal (with inline type creation), "+ Add Asset Type" modal.
- `/asset-types/:id` → [AssetType.jsx](./client/src/pages/AssetType.jsx): asset list with column filters, bulk actions, XLSX export, Configure Form, Configure Automations, Customize Columns, Rename, Delete Asset Type.
- `/asset-types/:assetTypeId/new` → [AssetEditor.jsx](./client/src/pages/AssetEditor.jsx) (create mode).
- `/assets/:publicId` → [AssetDetail.jsx](./client/src/pages/AssetDetail.jsx).
- `/assets/:publicId/edit` → [AssetEditor.jsx](./client/src/pages/AssetEditor.jsx) (edit mode).
- `/reports` → [Reports.jsx](./client/src/pages/Reports.jsx): aggregates every asset type, client-side filter/sort/export.
- `/common-form` → [CommonForm.jsx](./client/src/pages/CommonForm.jsx): global common form + its automations.
- `/fields` → [Fields.jsx](./client/src/pages/Fields.jsx).
- `/dropdowns` → [Dropdowns.jsx](./client/src/pages/Dropdowns.jsx).
- `/settings` → [Settings.jsx](./client/src/pages/Settings.jsx): branding + change password only.
- `/` (public) → [Login.jsx](./client/src/pages/Login.jsx): sign-in card + Quick Entry form, shown in place when signed out. There is no `/login` route.
- `/setup` → public.

Shared components: [DynamicForm.jsx](./client/src/components/DynamicForm.jsx), [AutomationBuilder.jsx](./client/src/components/AutomationBuilder.jsx), [ui.jsx](./client/src/components/ui.jsx), [Turnstile.jsx](./client/src/components/Turnstile.jsx). Contexts: [AuthContext.jsx](./client/src/context/AuthContext.jsx), [ToastContext.jsx](./client/src/context/ToastContext.jsx).

---

## 5. Confirmed bugs (code-level diagnosis)

### Bug 1 — "Add Asset" from Dashboard shows an empty form for a newly created asset type

**User-visible symptom.** From the Dashboard, the user opens "+ Add Asset", types a brand-new asset type name, clicks "Create …", and the form area shows "No fields configured for this asset type yet." even though a Common Form with fields already exists.

**Root cause (confirmed by reading the code).**

1. [Dashboard.jsx:112–130](./client/src/pages/Dashboard.jsx) — `createTypeAndSelect()` calls `api.assetTypes.create({ name })` and then immediately calls `selectType(created)`.
2. [Dashboard.jsx:81–110](./client/src/pages/Dashboard.jsx) — `selectType()` calls `api.assets.form(type.id)`, which hits `GET /api/v1/asset-types/:assetTypeId/assets/form`.
3. [assets/controller.js:6](./server/src/modules/assets/controller.js) routes that to `getAssetForm(assetTypeId)` in [assets/service.js:10–38](./server/src/modules/assets/service.js). That query reads **only** from `asset_type_fields JOIN field_definitions`. For a brand-new type, `asset_type_fields` has zero rows, so the response is `[]`.
4. [assetTypes/service.js:27–44](./server/src/modules/assetTypes/service.js) — `createAssetType` only does `INSERT INTO asset_types (name, slug) VALUES (?, ?)`. It **does not** call `attachCommonFields`.
5. [commonForms/service.js:80–88](./server/src/modules/commonForms/service.js) — `attachCommonFields(assetTypeId, conn)` exists and does `INSERT IGNORE` of every common-form field into `asset_type_fields`. It is invoked from exactly two places:
   - [assets/service.js:137–139](./server/src/modules/assets/service.js) inside `createAsset`, i.e. **after** the user has already submitted the form.
   - [commonForms/service.js:56](./server/src/modules/commonForms/service.js) inside `syncCommonFieldOrder`, which runs only when the admin saves the Common Form.
6. Therefore, between "type created" and "first asset saved", the type has no rows in `asset_type_fields`, and every form-reading endpoint returns an empty list.

**The same gap also affects:**

- [AssetEditor.jsx:54](./client/src/pages/AssetEditor.jsx) when the user navigates to `/asset-types/:id/new` for a freshly created type.
- [AssetType.jsx:207–211](./client/src/pages/AssetType.jsx) which calls `api.assetTypes.form(id)` (a different endpoint, [assetTypes/service.js:90–115](./server/src/modules/assetTypes/service.js) `getForm`) — that query also reads only `asset_type_fields` and returns `[]` for a new type.
- [Dashboard.jsx:51](./client/src/pages/Dashboard.jsx) "+ Add Asset Type" modal — same `createAssetType` path, same gap.

**Secondary observation.** [Dashboard.jsx:290–294](./client/src/pages/Dashboard.jsx) already renders an empty-state message, but it is indistinguishable from a genuine "admin intentionally configured zero fields" state. The user cannot tell whether the form is broken or merely unconfigured, and there is no shortcut to "Configure Form" from that modal.

**Planned correction (Phase 1).**

- Make common-field initialization happen **at asset-type creation time**, inside the same transaction as the `INSERT INTO asset_types`. Concretely: `createAssetType` should call `attachCommonFields(newTypeId, conn)` before committing.
- Keep `attachCommonFields` idempotent (it already uses `INSERT IGNORE`, so re-running is safe) and keep the call inside `createAsset` as a defensive net for types created before this fix.
- Make the form-reading endpoints (`getAssetForm`, `getForm`) tolerant: if `asset_type_fields` is empty **and** the common form has fields, either (a) auto-attach inside a transaction and re-read, or (b) return a structured `uninitialized: true` flag so the UI can offer "Initialize from Common Form". Option (a) is simpler and matches user expectation; option (b) is safer for admin-controlled workflows. **Decision needed before implementation.**
- Improve the Dashboard empty state to distinguish "no fields configured for this type" from "common form is empty" and provide a direct link to `/asset-types/:id` → Configure Form.

**Acceptance checks.**

- Create a type from the Dashboard "+ Add Asset" modal → the form immediately shows every active common-form field with correct required/show-in-list/order.
- Create a type from the Dashboard "+ Add Asset Type" modal, then navigate to `/asset-types/:id/new` → same initialized form.
- Create a type, then save the Common Form with a new field → the new field appears on the type (existing `syncCommonFieldOrder` behavior preserved).
- A type whose common form is genuinely empty shows a clear "Common Form has no fields yet — configure it" message with a link to `/common-form`.
- Existing types with manually added fields are not disturbed by the initialization step.

---

### Bug 2 — Automation rules fire only on Save, not live while the user edits the form

**User-visible symptom.** The user configures a rule like "when `status` equals `Issued`, set `issue_date` to today". While filling the form, changing `status` to `Issued` does nothing visible. Only after pressing Save does `issue_date` get populated.

**Root cause (confirmed by reading the code).**

1. [DynamicForm.jsx](./client/src/components/DynamicForm.jsx) handles `onChange` for every field type by calling `setValues(v => ({ ...v, [field.key]: ... }))`. The only `useEffect` in the component (lines 12–29) auto-fills `auto_date` fields with today's date. **It never reads, receives, or evaluates automation rules.**
2. [AutomationBuilder.jsx](./client/src/components/AutomationBuilder.jsx) is a CRUD UI for rules. It calls `api.automations.list(assetTypeId)` and `api.commonForm.automations.list()` to display rules, and `create`/`remove` to mutate them. It does **not** pass rules to `DynamicForm`.
3. The server-side rule evaluators are [applyAutomations](./server/src/modules/assets/automation.js) (lines 76–101) and [applyCommonAutomations](./server/src/modules/commonForms/automationService.js) (lines 64–83). Both are invoked from exactly two call sites:
   - [assets/service.js:157](./server/src/modules/assets/service.js) inside `createAsset`.
   - [assets/service.js:205–209](./server/src/modules/assets/service.js) inside `updateAsset`.
4. No endpoint exposes the merged active rule set to the form-rendering client. `GET /asset-types/:id/automations` exists but returns only asset-type rules, not common-form rules, and is consumed only by `AutomationBuilder`.

**Why the current server-side behavior must remain.** Rules applied on the server are the authoritative source of truth. A direct API caller (curl, script, integration) must not be able to bypass them. Live client-side evaluation is a UX layer on top of, not a replacement for, server evaluation.

**Planned correction (Phase 2).**

- Define a **single rule-evaluation contract** shared by client and server. Same condition semantics (`filled`, `empty`, `changed`, `equals`), same action semantics (`set_value`, `set_today`), same type coercion rules (number, boolean, dropdown, date), same precedence between common-form and asset-type rules.
- Expose the merged active rule set to the form. Two viable shapes:
  - (a) Extend `GET /asset-types/:id/assets/form` to return `{ fields, automations }` where `automations` is the ordered list of common-form rules followed by asset-type rules.
  - (b) Add a dedicated `GET /asset-types/:id/automations/effective` that returns the merged list. Option (a) is one round-trip; option (b) is cleaner separation. **Decision needed.**
- In `DynamicForm`, after every `setValues` triggered by a user edit, run the evaluator over the next values and apply any rule whose source field changed. Use a bounded fixed-point loop (e.g. max 10 passes) to support chained rules and prevent cycles.
- Track which fields were last filled by automation so a manual user edit to that field clears the "automated" flag and prevents the next evaluation pass from silently overwriting the manual value.
- Keep server-side `applyAutomations` and `applyCommonAutomations` exactly as they are on create/update. The client preview and the server result must match; if they diverge, the server wins and the UI should re-render with the server's values.
- Add tests for: rule order, chained rules, manual override after automation, clearing a field that was auto-filled, `changed` condition with previousValues, cycle detection, dropdown/number/boolean coercion parity between client and server.

**Acceptance checks.**

- Configure "when A equals X, set B to Y". Open the asset form, change A to X → B updates immediately, before Save.
- Configure "when A is filled, set B to today". Type any value into A → B becomes today's date.
- Configure a chain: A → B, B → C. Changing A updates B and then C in the same tick.
- Manually clear B after automation filled it → B stays cleared until A changes again.
- Save the form → the persisted values match exactly what the live preview showed.
- Call `POST /asset-types/:id/assets` directly with the same payload but with B omitted → the server still applies the rule and persists B.

---

## 6. Extension scope A — Multi-user, roles, permissions, and per-user customization

### 6.1 What the user asked for

- Multiple users, not just one admin.
- Admin can define per-user permissions: who can create assets, which assets they can see, which they can edit, who can customize the common form, who can create their own asset types and fields.
- **Per-user customization**: one user may want a different set of asset types, different fields, a different common form, different reports. One user's settings must not affect another user's.
- Admin retains full rights over everything.
- Reports must be user-scoped: each user sees only their own assets in reports.

### 6.2 Why this is a data-model and backend-authorization change, not just a UI change

Today every table is global. Hiding buttons in React would not prevent a curious user from calling `GET /api/v1/assets/:publicId` with someone else's UUID, or `PATCH /api/v1/fields/:id` with someone else's field id. **Every list, detail, create, update, delete, bulk, form, automation, export, and report query must be scoped and authorized on the server.** The frontend hides/disables for usability; the backend enforces for security.

### 6.3 Proposed identity and permission model

- The existing single account becomes the **admin** after migration. Admin can:
  - Create, deactivate, reactivate, and delete users.
  - Reset passwords (with a forced-change-on-next-login flag).
  - Grant and revoke individual permissions.
  - View and manage every user's asset types, fields, dropdowns, forms, automations, assets, reports, and email configuration.
  - Manage global SMTP settings.
- New accounts are **regular users** with a least-privilege default permission bundle (decision needed; recommended default: can view and create own assets, cannot create asset types or fields until granted).
- Permissions are **explicit capabilities**, not a single `role` enum. A capability-based model lets the admin grant exactly what's needed.

#### Suggested capability list

| Area | Capabilities |
|---|---|
| Accounts (admin-only) | `users.create`, `users.deactivate`, `users.reset_password`, `users.assign_permissions`, `users.delete` |
| Asset types | `asset_types.view_own`, `asset_types.create_own`, `asset_types.edit_own`, `asset_types.delete_own`, `asset_types.view_all` (admin) |
| Assets | `assets.view_own`, `assets.create_own`, `assets.edit_own`, `assets.delete_own`, `assets.bulk_own`, `assets.view_all` (admin) |
| Schema/config | `fields.manage_own`, `dropdowns.manage_own`, `common_form.manage_own`, `automations.manage_own` |
| Reports/exports | `reports.view_own`, `reports.export_own`, `reports.view_all` (admin) |
| Email | `email.rules.manage_own`, `email.templates.manage_own`, `email.history.view_own`, `email.history.view_all` (admin) |
| Global settings (admin-only) | `smtp.configure`, `branding.manage` |

The admin UI should present these as a checklist per user. The exact default bundle for newly created users must be agreed before implementation.

### 6.4 Proposed data-model direction

Add an `owner_user_id` column to every user-managed table. Convert globally-unique constraints into owner-scoped unique constraints so two users can independently create a field with key `serial_number` or a dropdown with slug `department`.

| Table | New column(s) | Constraint changes |
|---|---|---|
| `users` | `role ENUM('admin','user') NOT NULL DEFAULT 'user'`, `is_active BOOLEAN NOT NULL DEFAULT TRUE`, `must_change_password BOOLEAN NOT NULL DEFAULT FALSE` | — |
| `user_permissions` (new) | `user_id`, `capability VARCHAR(80)` | PK `(user_id, capability)` |
| `asset_types` | `owner_user_id BIGINT UNSIGNED NOT NULL` | Drop `UNIQUE(slug)`; add `UNIQUE(owner_user_id, slug)` |
| `dropdowns` | `owner_user_id` | Drop `UNIQUE(slug)`; add `UNIQUE(owner_user_id, slug)` |
| `dropdown_options` | (inherits via dropdown) | Unchanged |
| `field_definitions` | `owner_user_id` | Drop `UNIQUE(key)`; add `UNIQUE(owner_user_id, key)` |
| `asset_type_fields` | (inherits via asset_type) | Unchanged |
| `assets` | `owner_user_id` (denormalized for fast scoping) **or** derive via `asset_type.owner_user_id`. Denormalizing is recommended for query simplicity and indexable list/report queries. | Add `INDEX(owner_user_id, asset_type_id, created_at)` |
| `asset_automations` | (inherits via asset_type) | Unchanged |
| `common_forms` | Replace `id TINYINT PRIMARY KEY` with `id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY`, add `owner_user_id BIGINT UNSIGNED NOT NULL UNIQUE` | One common form per user |
| `common_form_fields` | (inherits via common_form) | Unchanged |
| `common_form_automations` | (inherits via common_form) | Unchanged |
| `app_settings` | Stays global (branding, SMTP). Add `scope ENUM('global','user')` and `owner_user_id NULL` only if per-user settings are ever needed. For now SMTP is global, branding is global. | — |

**Migration of existing data.** All current rows in `asset_types`, `dropdowns`, `field_definitions`, `assets`, `common_forms` (the single id=1 row), `common_form_fields`, `common_form_automations`, `asset_automations`, `asset_type_fields` must be assigned to the existing admin user. The migration must run inside a transaction and must be idempotent.

**Hard-coded `COMMON_FORM_ID = 1`.** [commonForms/service.js:5](./server/src/modules/commonForms/service.js) and [commonForms/automationService.js:6](./server/src/modules/commonForms/automationService.js) both hard-code `const COMMON_FORM_ID = 1`. After the migration, the common form id must be resolved per request from `req.session.userId` (e.g. `SELECT id FROM common_forms WHERE owner_user_id = ?`). Every query in those two files must be updated.

**Cross-user FK safety.** `asset_type_fields.field_definition_id` currently references any field. After multi-user, it must only reference fields owned by the same user (or explicitly shared fields, if a sharing model is chosen — see Risks). The service layer must validate this on every write.

### 6.5 Proposed backend authorization pattern

- Extend the session to include `role` and a cached `permissions` set. Refresh on login and after any permission change.
- Add a `requirePermission('capability')` middleware that throws `403 FORBIDDEN` when the session user lacks the capability.
- Add an `assertOwnership(table, id, userId)` helper used by every service function that reads or mutates a single record by id.
- Add a `scopeQuery(userId, role)` helper that appends `WHERE owner_user_id = ?` for regular users and no-op for admin (or `WHERE owner_user_id IN (...)` if admin impersonation is ever added).
- Apply both to every route in [routes.js](./server/src/routes.js). No route should remain with only `requireAuth`.
- Admin-wide access must be an **explicit** authorized scope (`role === 'admin'` or `assets.view_all`), not an accident of missing WHERE clauses.

### 6.6 Proposed frontend changes

- Add a "Users" admin page (visible only to admin) for account creation, deactivation, password reset, and permission assignment.
- Gate every nav item, button, and modal action by the current user's permissions. The `AuthContext` should expose `can('capability')`.
- The Common Form page, Fields page, Dropdowns page, Asset Type page, Reports page, and Settings page all become user-scoped automatically because the API returns only the current user's data. No UI change is needed beyond permission gating.
- Reports page must stop assuming it can fetch every asset type. It already calls `api.assetTypes.list()` which will naturally return only the user's types after scoping.
- Add a "Switch to user view" toggle for admin (optional, useful for support).

### 6.7 Acceptance checks

- A regular user cannot read, update, or delete another user's asset, asset type, field, dropdown, common form, automation, or report by guessing IDs or calling endpoints directly.
- A regular user cannot escalate their own permissions.
- Admin can create a user, grant a specific capability, and see that capability take effect immediately on the user's next request (or next login, depending on session refresh strategy).
- Two users can each create a field with key `serial_number` and a dropdown with slug `department` without conflict.
- Each user's Common Form is independent; saving one does not affect the other.
- Reports and XLSX export include only records the requesting user may see.
- The existing single-admin installation migrates without data loss; the admin still sees every pre-existing record.
- Deactivating a user immediately invalidates their sessions.

---

## 7. Extension scope B — Global SMTP, per-user email rules, templates, history, and toasts

### 7.1 What the user asked for

- SMTP configuration in Settings, **managed once by admin**, used by everyone.
- Per-asset-type, per-field-change email triggers. Example: on the Laptop asset type, when `status` becomes `Issued`, send an email to a configured recipient list.
- Admin controls which users may configure email rules for themselves.
- Email templates with placeholders.
- Recipient management.
- A toast that accurately says whether the email was sent.
- Email history: each user sees their own; admin sees everyone's.
- One user's email settings must not affect another user's.

### 7.2 Current state

- No mail transport dependency in [server/package.json](./server/package.json). `nodemailer` (or equivalent) must be added.
- No email-related tables in [server/migrations](./server/migrations).
- [Settings.jsx](./client/src/pages/Settings.jsx) only handles branding and password change.
- [app_settings](./server/migrations/005_branding.sql) currently stores only `favicon_data_url` and `app_icon_data_url`.

### 7.3 Proposed SMTP configuration (global, admin-only)

- Store SMTP config in `app_settings` (or a dedicated `smtp_settings` single-row table) with keys: `smtp_host`, `smtp_port`, `smtp_secure` (boolean), `smtp_user`, `smtp_password_encrypted`, `smtp_from_email`, `smtp_from_name`, `smtp_reply_to`, `smtp_enabled`.
- **Encrypt the password at rest** using a deployment secret read from `process.env.SMTP_ENCRYPTION_KEY` (new env var, added to [env.js](./server/src/config/env.js) and [.env.example](./server/.env.example)). Use AES-256-GCM with a random IV per encryption; store `iv:tag:ciphertext` base64-encoded.
- **Never return the password** from any API. The GET response should include `passwordConfigured: true|false` and nothing else about the secret.
- Add a "Send test email" action that delivers a fixed template to a provided address and reports success/failure synchronously (this one is acceptable to do synchronously because it's an explicit admin action with a visible spinner).
- Add a "Test connection" action that performs SMTP handshake without sending.
- Rate-limit test actions to prevent abuse.

### 7.4 Proposed email templates, recipients, and rules (per-user)

New tables:

- `email_templates` — `id`, `owner_user_id`, `name`, `subject_template`, `body_template` (TEXT, supports `{{placeholder}}`), `is_active`, timestamps.
- `email_recipients` — `id`, `owner_user_id`, `name`, `email`, `is_active`, timestamps.
- `email_rules` — `id`, `owner_user_id`, `asset_type_id`, `trigger_type ENUM('asset_created','field_changed')`, `trigger_field_id NULL` (required when `field_changed`), `trigger_condition ENUM('any_change','equals','not_equals','filled','empty') NULL`, `trigger_condition_value NULL`, `template_id`, `is_active`, timestamps.
- `email_rule_recipients` — join table `(rule_id, recipient_id)`.
- `email_outbox` — transactional outbox: `id`, `owner_user_id`, `rule_id`, `asset_public_id`, `event_type`, `payload_json` (snapshot of values used to render), `template_snapshot_json` (frozen subject/body at enqueue time), `recipients_json` (frozen list), `status ENUM('pending','sending','sent','failed','cancelled')`, `attempts INT`, `next_attempt_at`, `last_error TEXT NULL`, `created_at`, `sent_at NULL`.
- `email_history` — could be the same as `email_outbox` with status filtering, or a separate append-only table. Recommend: keep one table (`email_outbox`) and expose it as history with status filters. Simpler, avoids duplication.

**Placeholder contract.** A controlled set, e.g.:
- `{{asset_type_name}}`, `{{asset_public_id}}`, `{{created_at}}`, `{{updated_at}}`
- `{{field.<key>}}` for any field on the asset type
- `{{field.<key>.previous}}` for the pre-update value (only meaningful on `field_changed`)
- `{{user.email}}`, `{{user.name}}` (the owner of the rule)

Unknown placeholders must be rejected at template-save time with a clear error. Values must be HTML-escaped when the body is HTML, or passed through as plain text when the body is plain text.

**Rule scoping.** A rule's `asset_type_id` must be owned by the same user. A rule's `template_id` and every `recipient_id` must be owned by the same user. The service layer must validate all three on create and update. Admin can view/manage all rules but cannot mix owners (an admin-managed rule still belongs to a specific user).

### 7.5 Proposed delivery model (transactional outbox + async worker)

**Why not send synchronously inside the asset-save request?**

- A slow or unreachable SMTP server would block or fail the asset save.
- A failed save would silently lose the notification, or a successful save with a failed notification would be indistinguishable from success.
- Bulk updates (`bulkUpdateAssets` in [assets/service.js:235–245](./server/src/modules/assets/service.js)) loop over many assets; sending inline would multiply latency.

**Proposed flow.**

1. Inside the same transaction that writes the asset change, evaluate every active rule for that asset type and owner. For each matching rule, insert one `email_outbox` row with `status='pending'`, a frozen template snapshot, a frozen recipient list, and a payload snapshot of the values needed to render.
2. A background worker (a `setInterval` loop inside the same Express process, or a separate `node src/worker.js` process — decision needed) polls `email_outbox` for `status='pending' AND next_attempt_at <= NOW()`, claims rows with an atomic `UPDATE ... WHERE id IN (...) AND status='pending'`, renders the template, sends via nodemailer, and updates status to `sent` or `failed` with `last_error`.
3. Retries: exponential backoff, max 5 attempts, then `failed` permanently. Transient errors (connection refused, timeout, 4xx SMTP) retry; permanent errors (5xx auth, invalid recipient) fail immediately.
4. Loop protection: a rule that triggers on `field_changed` for a field that the rule itself sets via automation could in theory loop. The outbox row is written once per user-initiated change, not per automation pass, so this is naturally bounded. Add an explicit guard: never enqueue from inside the worker.
5. No-op suppression: on update, if no tracked field actually changed value, do not enqueue. Compare `previousValues` to `nextValues` for the trigger field.

**Toast semantics.**

- On save, the API response includes `notificationsQueued: N`.
- The client shows: `"Asset saved. N notification(s) queued."` (not "sent").
- A separate `GET /api/v1/email/history?status=sent|failed|pending` lets the UI poll or refresh to show final delivery state.
- If the worker fails permanently, the history entry shows `failed` with a sanitized error. The user sees this in their history page; admin sees it in the global history page.

### 7.6 Proposed API surface

Admin-only:
- `GET|PUT /api/v1/settings/smtp` (PUT requires `smtp.configure`)
- `POST /api/v1/settings/smtp/test-connection`
- `POST /api/v1/settings/smtp/test-email`
- `GET /api/v1/email/history/all` (admin, cross-user)

User-scoped:
- `GET|POST /api/v1/email/templates`, `GET|PATCH|DELETE /api/v1/email/templates/:id`
- `GET|POST /api/v1/email/recipients`, `GET|PATCH|DELETE /api/v1/email/recipients/:id`
- `GET|POST /api/v1/email/rules`, `GET|PATCH|DELETE /api/v1/email/rules/:id`
- `GET /api/v1/email/history` (own only)
- `POST /api/v1/email/rules/:id/test` (send a test render to the rule's recipients, admin-gated or permission-gated)

### 7.7 Proposed frontend changes

- Settings page gains an admin-only "SMTP" card with host/port/security/user/password/from fields, a "Test connection" button, a "Send test email" button, and a clear "Configured / Not configured" badge. Password field is write-only; the UI never displays the stored value.
- A new "Email Notifications" nav item (visible to users with `email.rules.manage_own`) with three tabs: Templates, Recipients, Rules.
- A new "Email History" nav item (visible to users with `email.history.view_own`; admin sees a cross-user toggle).
- Rule editor: pick asset type → pick trigger (`asset_created` or `field_changed`) → if `field_changed`, pick field and condition → pick template → pick recipients → save.
- Template editor: name, subject, body with a placeholder picker that inserts `{{field.<key>}}` tokens. Live preview against a sample asset.
- Toasts: extend [ToastContext.jsx](./client/src/context/ToastContext.jsx) to support a `queued` variant alongside `success` and `error`.

### 7.8 Acceptance checks

- SMTP password is never returned by `GET /api/v1/settings/smtp`; only `passwordConfigured: true|false`.
- Only admin can edit SMTP. A regular user calling `PUT /api/v1/settings/smtp` gets 403.
- A regular user can create templates, recipients, and rules only for their own asset types. Cross-owner IDs are rejected with 403/404.
- Creating an asset that matches a rule enqueues exactly one outbox row per matching rule, in the same transaction as the asset insert. If the asset insert rolls back, the outbox row rolls back too.
- Updating an asset where the trigger field did not change enqueues nothing.
- Updating an asset where the trigger field changed from `A` to `B` enqueues one row with `previous=A`, `next=B` in the payload.
- The worker delivers pending rows, marks them `sent`, and records `sent_at`. On transient failure it retries with backoff. On permanent failure it marks `failed` with a sanitized error.
- User sees only their own history. Admin sees all history with a user filter.
- Toast on save says "queued", not "sent". History page reflects final delivery state.
- Two users can each have a rule on their own "Laptop" asset type with the same field name `status` without interference.
- Killing and restarting the worker does not duplicate sends (claim is atomic via `UPDATE ... WHERE status='pending'`).

---

## 8. Implementation phases

### Phase 0 — Baseline, decisions, and safety net

1. Capture a full database backup and document the current migration state.
2. Add focused regression tests for the existing single-admin behavior: asset-type creation, form initialization, automation evaluation on save, common-form sync, dropdown option rename cascade, reports aggregation, branding, password change.
3. Resolve the open decisions listed in §10.
4. Agree on the default permission bundle for newly created users.
5. Agree on the SMTP encryption key management approach (env var vs. secrets manager).

**Exit criteria:** Existing workflows are covered by tests; decisions are recorded; backup is verified restorable.

### Phase 1 — Fix Bug 1 (form initialization) and improve empty-state UX

1. Modify `createAssetType` in [assetTypes/service.js](./server/src/modules/assetTypes/service.js) to call `attachCommonFields(newId, conn)` inside the same transaction as the type insert.
2. Decide and implement the form-reading behavior for genuinely-empty types (auto-attach vs. `uninitialized` flag).
3. Update [Dashboard.jsx](./client/src/pages/Dashboard.jsx) empty state to distinguish "no fields configured" from "common form is empty" and link to the right configuration page.
4. Verify the AssetType page "+ Add Asset" flow and the AssetEditor flow for freshly created types.
5. Add tests: create type → form has common fields; create type with empty common form → clear empty state; create type → save common form with new field → type picks it up.

**Exit criteria:** Both reported reproduction paths show the configured form immediately after type creation. No regression in existing type/form flows.

### Phase 2 — Fix Bug 2 (live automations)

1. Define the shared rule-evaluation contract (conditions, actions, coercion, precedence, cycle bound).
2. Expose the merged active rule set to the form (extend the form endpoint or add a dedicated one).
3. Implement the evaluator in [DynamicForm.jsx](./client/src/components/DynamicForm.jsx) with manual-override tracking and bounded fixed-point looping.
4. Keep server-side evaluation authoritative; ensure client and server produce identical results for identical inputs.
5. Add tests for every condition/action combination, chained rules, manual override, clearing, cycle prevention, and client/server parity.

**Exit criteria:** Rules fire live in the form; saved values match the live preview; direct API calls still apply rules server-side.

### Phase 3 — Multi-user identity, ownership, and authorization

1. Add `role`, `is_active`, `must_change_password` to `users`. Add `user_permissions` table.
2. Add `owner_user_id` to every user-managed table. Convert globally-unique constraints to owner-scoped.
3. Backfill all existing rows to the current admin user. Convert the single `common_forms` row to admin-owned and switch the table to auto-increment PK with a unique owner constraint.
4. Replace every hard-coded `COMMON_FORM_ID = 1` with a per-request lookup.
5. Extend the session to carry role and permissions. Add `requirePermission` and `assertOwnership` middleware/helpers.
6. Update every service function in [assetTypes](./server/src/modules/assetTypes), [assets](./server/src/modules/assets), [commonForms](./server/src/modules/commonForms), [fields](./server/src/modules/fields), [dropdowns](./server/src/modules/dropdowns), and the reports aggregation to scope by owner.
7. Add admin-only user-management endpoints and a Users page in the frontend.
8. Add `can('capability')` to [AuthContext.jsx](./client/src/context/AuthContext.jsx) and gate every nav item, button, and modal action.
9. Add migration rollback/backup guidance and verify existing admin data remains accessible.
10. Add tests for every capability allowed and denied, direct API requests with guessed IDs, bulk actions, report/export scope, deactivated accounts.

**Exit criteria:** A regular user cannot access another user's records by any means; admin can manage all users and data; existing single-admin installation migrates cleanly.

### Phase 4 — Global SMTP and user-scoped email notifications

1. Add `nodemailer` (or equivalent) to [server/package.json](./server/package.json).
2. Add `SMTP_ENCRYPTION_KEY` to [env.js](./server/src/config/env.js) and [.env.example](./server/.env.example).
3. Add migrations for `smtp_settings` (or `app_settings` keys), `email_templates`, `email_recipients`, `email_rules`, `email_rule_recipients`, `email_outbox`.
4. Implement admin-only SMTP CRUD with encrypted password storage and test-connection/test-email actions.
5. Implement user-scoped templates, recipients, and rules CRUD with owner validation.
6. Implement transactional outbox enqueue inside `createAsset` and `updateAsset` (and `bulkUpdateAssets`).
7. Implement the delivery worker with atomic claim, retries, backoff, and permanent-failure handling. Decide single-process interval vs. separate worker process.
8. Implement history endpoints (own + admin-all) and the History page.
9. Extend [ToastContext.jsx](./client/src/context/ToastContext.jsx) with a `queued` variant and update save flows to use it.
10. Add tests for credential secrecy, owner validation, trigger matching, no-op suppression, retry behavior, duplicate prevention on worker restart, and history scoping.

**Exit criteria:** SMTP credentials never leak; rules fire on the correct events; outbox is transactional with the asset change; worker delivers reliably; history is correctly scoped; toasts are accurate.

### Phase 5 — Regression, security, and deployment validation

1. Run the full backend test suite, frontend production build, migration checks on a fresh database and on a populated existing database.
2. Penetration-test the authorization layer: guessed IDs, direct API calls, bulk actions, export endpoints, report aggregation, email history.
3. Test with two ordinary users plus admin: same-named asset types, same field keys, same dropdown slugs, independent common forms, independent email rules.
4. Test SMTP success, transient failure with retry, permanent failure, worker restart mid-delivery, and history access.
5. Update [README.md](./README.md), [docker-compose.example.yaml](./docker-compose.example.yaml), and [.env.example](./server/.env.example) for new secrets, the worker process model, and admin setup.
6. Verify the Docker image starts cleanly, runs migrations, and serves both API and frontend.

---

## 9. Cross-cutting test plan

- **Form initialization:** no common fields, existing common fields, removed common fields, inactive fields, newly created type, type with manually configured fields, type created via Dashboard modal, type created via Asset Type page.
- **Live automations:** every condition (`filled`, `empty`, `changed`, `equals`) × every action (`set_value`, `set_today`) × every field type (text, multiline, number, boolean, date, auto_date, dropdown, quantity). Overlapping rules, chained rules, manual override, clearing an auto-filled field, cycle prevention, client/server parity.
- **Authorization:** each capability allowed and denied; direct API requests with guessed IDs; bulk actions; report/export scope; deactivated accounts; session refresh after permission change; admin impersonation (if added).
- **Data isolation:** cross-user asset IDs, asset-type IDs, field IDs, dropdown IDs, common-form IDs, automation IDs, template IDs, recipient IDs, rule IDs, outbox IDs.
- **Migrations:** fresh database, populated existing single-admin database, rerun/idempotency, backup/restore verification, constraint conversion (global UNIQUE → owner-scoped UNIQUE) without data loss.
- **Email:** valid and invalid SMTP settings, credential secrecy in every API response, recipient validation, create/update triggers, no-op suppression, retries with backoff, permanent failure handling, duplicate prevention on worker restart, audit/history scope, accurate UI toasts.

---

## 10. Risks and open decisions (must resolve before implementation)

1. **Ownership model.** Is every user-created schema strictly private, or is there a "shared catalog" of admin-managed fields/dropdowns that all users can reference? The request implies private-by-default. **Decision needed.**
2. **Default permissions for new users.** What can a freshly created user do out of the box? Recommended least-privilege: view own assets, create own assets, no schema management until granted. **Decision needed.**
3. **Admin edit semantics.** Can admin edit a user's configuration in place, or only inspect it? The request says "admin ke paas pure right ho kam jyada karne ke" — assume both inspect and edit. **Confirm.**
4. **Legacy record ownership.** All existing data must be assigned to the current admin during migration. Confirm this is acceptable, or specify a different target owner.
5. **Common form per user vs. per user + admin-shared template.** Should a new user start with an empty common form, or inherit a copy of the admin's current common form as a starting point? **Decision needed.**
6. **Rule conflicts and precedence.** When a common-form rule and an asset-type rule both target the same field, which wins? Current server code applies common first, then asset-type (asset-type wins). Preserve this or change? **Confirm.**
7. **Live automation override semantics.** If automation fills field B and the user manually clears B, should the next evaluation pass re-fill B? Recommended: no — once manually touched, B is "user-owned" until the source field changes again. **Confirm.**
8. **SMTP encryption key management.** `SMTP_ENCRYPTION_KEY` as an env var is the simplest approach. If the deployment uses a secrets manager, document the retrieval path. **Decision needed.**
9. **Worker process model.** Single-process `setInterval` inside Express is simplest for a single-container deployment but risks duplicate sends if the container is scaled horizontally. A separate worker process with a lock (e.g. MySQL `GET_LOCK`) is safer. **Decision needed.**
10. **Email rate limiting.** Per-user daily/hourly send caps to prevent abuse. Recommended: configurable global cap plus per-user cap. **Decision needed.**
11. **Template format.** Plain text vs. HTML vs. both. HTML requires careful escaping to prevent injection of user-controlled field values into markup. Recommend plain text by default with an opt-in HTML mode that auto-escapes all placeholders. **Decision needed.**
12. **Deployment secrets.** New env vars (`SMTP_ENCRYPTION_KEY`, possibly `EMAIL_WORKER_INTERVAL_MS`, `EMAIL_MAX_ATTEMPTS`) must be added to [docker-compose.example.yaml](./docker-compose.example.yaml) and documented in [README.md](./README.md).

---

## 11. Review limitations

This was a source-level architecture and behavior review. No database connection, production deployment, or live SMTP configuration was inspected. No migrations, builds, or tests were executed because the requested work was documentation-only and no application code was changed. The diagnosis of both bugs is based on reading the current source at the file:line references cited above and should be re-confirmed against the reported reproduction steps before implementing Phase 1 and Phase 2.

---

## 12. File reference index

Backend:
- [server/src/app.js](./server/src/app.js)
- [server/src/routes.js](./server/src/routes.js)
- [server/src/server.js](./server/src/server.js)
- [server/src/config/db.js](./server/src/config/db.js)
- [server/src/config/env.js](./server/src/config/env.js)
- [server/src/config/migrate.js](./server/src/config/migrate.js)
- [server/src/middleware/auth.js](./server/src/middleware/auth.js)
- [server/src/middleware/csrf.js](./server/src/middleware/csrf.js)
- [server/src/middleware/errorHandler.js](./server/src/middleware/errorHandler.js)
- [server/src/middleware/rateLimit.js](./server/src/middleware/rateLimit.js)
- [server/src/modules/assets/service.js](./server/src/modules/assets/service.js)
- [server/src/modules/assets/controller.js](./server/src/modules/assets/controller.js)
- [server/src/modules/assets/automation.js](./server/src/modules/assets/automation.js)
- [server/src/modules/assets/automationController.js](./server/src/modules/assets/automationController.js)
- [server/src/modules/assetTypes/service.js](./server/src/modules/assetTypes/service.js)
- [server/src/modules/assetTypes/controller.js](./server/src/modules/assetTypes/controller.js)
- [server/src/modules/commonForms/service.js](./server/src/modules/commonForms/service.js)
- [server/src/modules/commonForms/controller.js](./server/src/modules/commonForms/controller.js)
- [server/src/modules/commonForms/automationService.js](./server/src/modules/commonForms/automationService.js)
- [server/src/modules/commonForms/automationController.js](./server/src/modules/commonForms/automationController.js)
- [server/src/modules/fields/service.js](./server/src/modules/fields/service.js)
- [server/src/modules/fields/controller.js](./server/src/modules/fields/controller.js)
- [server/src/modules/dropdowns/service.js](./server/src/modules/dropdowns/service.js)
- [server/src/modules/dropdowns/controller.js](./server/src/modules/dropdowns/controller.js)
- [server/src/modules/auth/service.js](./server/src/modules/auth/service.js)
- [server/src/modules/auth/controller.js](./server/src/modules/auth/controller.js)
- [server/src/modules/branding/service.js](./server/src/modules/branding/service.js)
- [server/src/modules/branding/controller.js](./server/src/modules/branding/controller.js)
- [server/src/modules/setup/controller.js](./server/src/modules/setup/controller.js)
- [server/src/modules/setup/turnstile.js](./server/src/modules/setup/turnstile.js)
- [server/src/utils/validation.js](./server/src/utils/validation.js)
- [server/src/utils/slug.js](./server/src/utils/slug.js)
- [server/src/utils/dateTime.js](./server/src/utils/dateTime.js)
- [server/src/utils/errors.js](./server/src/utils/errors.js)
- [server/migrations/001_initial.sql](./server/migrations/001_initial.sql)
- [server/migrations/002_automations.sql](./server/migrations/002_automations.sql)
- [server/migrations/003_common_form.sql](./server/migrations/003_common_form.sql)
- [server/migrations/004_common_form_automations.sql](./server/migrations/004_common_form_automations.sql)
- [server/migrations/005_branding.sql](./server/migrations/005_branding.sql)
- [server/migrations/999_add_asset_list_columns.sql](./server/migrations/999_add_asset_list_columns.sql)

Frontend:
- [client/src/App.jsx](./client/src/App.jsx)
- [client/src/main.jsx](./client/src/main.jsx)
- [client/src/api/client.js](./client/src/api/client.js)
- [client/src/context/AuthContext.jsx](./client/src/context/AuthContext.jsx)
- [client/src/context/ToastContext.jsx](./client/src/context/ToastContext.jsx)
- [client/src/components/Layout.jsx](./client/src/components/Layout.jsx)
- [client/src/components/DynamicForm.jsx](./client/src/components/DynamicForm.jsx)
- [client/src/components/AutomationBuilder.jsx](./client/src/components/AutomationBuilder.jsx)
- [client/src/components/ui.jsx](./client/src/components/ui.jsx)
- [client/src/components/Turnstile.jsx](./client/src/components/Turnstile.jsx)
- [client/src/pages/Dashboard.jsx](./client/src/pages/Dashboard.jsx)
- [client/src/pages/AssetType.jsx](./client/src/pages/AssetType.jsx)
- [client/src/pages/AssetEditor.jsx](./client/src/pages/AssetEditor.jsx)
- [client/src/pages/AssetDetail.jsx](./client/src/pages/AssetDetail.jsx)
- [client/src/pages/Reports.jsx](./client/src/pages/Reports.jsx)
- [client/src/pages/CommonForm.jsx](./client/src/pages/CommonForm.jsx)
- [client/src/pages/Fields.jsx](./client/src/pages/Fields.jsx)
- [client/src/pages/Dropdowns.jsx](./client/src/pages/Dropdowns.jsx)
- [client/src/pages/Settings.jsx](./client/src/pages/Settings.jsx)
- [client/src/pages/Login.jsx](./client/src/pages/Login.jsx)
- [client/src/pages/Setup.jsx](./client/src/pages/Setup.jsx)
- [client/src/utils.js](./client/src/utils.js)
- [client/src/utils/date.js](./client/src/utils/date.js)

Deployment and config:
- [Dockerfile](./Dockerfile)
- [docker-compose.example.yaml](./docker-compose.example.yaml)
- [package.json](./package.json)
- [server/package.json](./server/package.json)
- [server/.env.example](./server/.env.example)
- [client/package.json](./client/package.json)
- [README.md](./README.md)
