# Asset Management App — Fixes and Extension Plan

## Scope and status

This document records a read-only review of the current React, Express/Node.js, and MySQL application and proposes a staged implementation plan for the reported form and automation issues, multi-user access, and email notifications.

**No application code, database schema, configuration, or existing documentation was changed as part of this review.** This file is the only intended deliverable. The proposed changes below are not implemented yet.

## Current application at a glance

- **Frontend:** React 19, Vite, React Router; dynamic forms, asset-type-specific lists, reports, and XLSX export.
- **Backend:** Express 5 REST API; SQL access through `mysql2`; request validation with Zod; session authentication.
- **Database:** MySQL; numbered SQL migrations run during server startup.
- **Current identity model:** A single initial administrator account can be set up. Login/session data contains a user ID and email, but no role or resource-level permission model is present.
- **Existing functional areas:** Asset types, field definitions, dropdowns, a global common form, per-asset-type and common-form automations, reports, spreadsheet exports, branding, and password changes.
- **Email:** No SMTP configuration, email templates, notification rules, delivery queue, or email history implementation was found in the reviewed source and dependencies.

Relevant implementation entry points include [Dashboard.jsx](./client/src/pages/Dashboard.jsx), [AssetEditor.jsx](./client/src/pages/AssetEditor.jsx), [DynamicForm.jsx](./client/src/components/DynamicForm.jsx), [AutomationBuilder.jsx](./client/src/components/AutomationBuilder.jsx), [asset service](./server/src/modules/assets/service.js), [common-form service](./server/src/modules/commonForms/service.js), [auth service](./server/src/modules/auth/service.js), [API routes](./server/src/routes.js), and the SQL files under [server/migrations](./server/migrations).

## Findings from the current code

### 1. New asset type can have no fields when adding an asset from the dashboard

The dashboard’s **Add Asset** flow selects an asset type and immediately requests its form using `api.assets.form(type.id)`. Creating a new type in this flow calls the same selection/form-loading function. That request is served by the asset form endpoint, which reads `asset_type_fields`.

The current behavior has an initialization gap:

1. `createAssetType` inserts the type but does not attach common-form fields.
2. The form-reading path returns the fields already attached to that type; it does not initialize the common fields.
3. `attachCommonFields` is only called later by `createAsset`, after the user has submitted the form.

Consequently, a newly created type (including one created from the dashboard’s add-asset flow) can present an empty form even though a common form has been configured. This is the leading code-supported explanation for the reported symptom. Asset types intentionally configured with no fields also need a clear empty-state message and a route to configure their form.

**Planned correction:** Make common-field initialization reliable before the first form is displayed, preferably as part of asset-type creation or an idempotent form-initialization path. Keep the operation safe under repeated requests and avoid modifying existing user-configured fields. Add a clear frontend empty state so “no fields configured” is not mistaken for a broken form.

### 2. Automation rules run on save, not as the user edits a form

The automation builder persists rules through the API. `DynamicForm` updates local form values when a user changes a control, but it does not evaluate automation rules. On the backend, asset-specific and common-form automations are applied in the asset create/update service. This explains why configured values are applied after saving rather than immediately when the source field changes.

Both automation families are currently evaluated server-side on create/update. That behavior is valuable for data integrity and must remain authoritative even after live client-side behavior is added.

**Planned correction:** Return or otherwise make the active rules available to the dynamic form, evaluate them on relevant field changes, and update dependent controls immediately. Reuse a clearly defined rule-evaluation contract across common and asset-type rules. Continue validating and applying the rules on the server on submit so API callers cannot bypass them.

Before implementing, define and test:

- Rule ordering and whether a rule-triggered target change can trigger another rule.
- What happens when multiple matching rules target the same field.
- What happens when the user manually changes or clears a value previously filled by automation.
- How `filled`, `empty`, `changed`, and `equals` behave for numbers, booleans, dropdowns, and empty values.
- A bounded evaluation strategy that prevents cycles or runaway rule chains.

### 3. Existing configuration and records are global, not user-scoped

The current database stores asset types, field definitions, dropdowns, assets, common forms, and automation rules without a user/owner identifier. `common_forms` is seeded with a single form using ID `1`. Field keys and dropdown slugs are globally unique. The reports page loads asset types and their assets across the whole application.

Authentication middleware checks only that a session has a user ID. There are no server-side role checks or per-resource access checks in the protected API routes. Hiding controls in React alone would not provide data isolation.

**Implication:** Multi-user support is a data-model and backend-authorization change, not just an account-creation screen. Every list, detail, update, delete, form, automation, export, and report query must be scoped and authorized on the server.

### 4. SMTP and email workflows are new functionality

The current settings page supports branding and password changes. The existing `app_settings` table is for global key/value settings; no email-specific settings or mail transport dependency was found. SMTP credentials must not be returned to the browser or stored as readable values.

## Proposed target behavior

### Users, roles, permissions, and data isolation

- The first existing account remains the **admin** after the migration. Admin can manage accounts, grant/revoke permissions, access all user data and configuration, and manage global SMTP settings.
- Additional accounts are regular users unless the admin explicitly grants more permissions.
- Permission enforcement happens in backend middleware/services and in every relevant SQL query. The frontend also hides or disables unavailable actions for usability, but is not treated as an authorization boundary.
- A user can view and work with only the assets, asset types, forms, fields, dropdowns, automation rules, reports, and email rules they own or are explicitly allowed to access.
- One user’s form, field, report, or notification configuration must not change another user’s configuration or results.
- Users may create and customize their own asset types, fields, forms, and reports only when their assigned permissions allow it. The admin can inspect/manage all users’ configurations and data.

#### Suggested permission areas

Use explicit capabilities, rather than a single broad “user/admin” check for every operation:

| Area | Example capabilities |
|---|---|
| Accounts | Create/deactivate users, reset accounts, assign permissions |
| Asset types | View, create, edit, delete own; admin access to all |
| Assets | View, create, edit, delete own; optionally grant more specific capabilities |
| Schema/configuration | Create/edit own fields, dropdowns, forms, automations |
| Reports/exports | View and export only in-scope records |
| Email | Configure own permitted notification rules/templates/recipients; view own history |
| Global settings | SMTP setup and global configuration, admin only |

The final permission UI should let the admin grant these capabilities independently. The exact default permission bundle for newly created users should be agreed before implementation; a least-privilege default is recommended.

#### Suggested data-model direction

Add ownership/scope relationships for user-managed records and enforce them consistently. A practical design is to add owner user IDs to user-owned asset types, field definitions, dropdowns, common forms, and notification configurations, with assets either carrying an owner ID or deriving a validated owner through their asset type. Use owner-aware unique constraints for field keys and dropdown slugs where users must be able to create similarly named definitions independently.

The existing single common form becomes one common form per owner. Common-form fields and rules remain tied to that owner’s form. Asset-type forms and automations must only reference fields visible to the same owner (or an explicitly shared/admin-managed catalog, if that model is selected).

The migration must preserve existing records and assign them to the existing admin account. Admin-wide access should be implemented as an explicit authorized scope, not by leaving all records accidentally unowned.

### SMTP, templates, notification rules, and delivery history

- SMTP configuration is **global and admin-only**, not user-specific. Provide a settings form with host, port, TLS mode, username, password, sender address/name, and a test-connection/test-email action as appropriate.
- Encrypt stored SMTP secrets using a deployment secret/key that is not stored in the same database row. Never return the password from an API response; expose only whether a credential is configured and safe connection metadata.
- Users can configure only the notification rules/templates/recipients they are permitted to manage. Rules are scoped to the owner’s asset types and cannot refer to another user’s data.
- Support asset-created and selected-field-changed events. A rule should identify its asset type, trigger, field/condition if applicable, recipient list, subject, and body template.
- Provide a controlled set of template placeholders, such as asset type and configured field values. Validate unknown placeholders and escape values appropriately for the email format.
- Store a delivery record per notification with owner, asset reference, event, recipients, template snapshot or version, status, timestamps, and sanitized error information. Users see only their own history; admin can see all history.
- Avoid sending mail synchronously inside the asset-save request. Record an email/outbox item transactionally with the asset change, then deliver it asynchronously with bounded retries and visible failure status. This prevents slow mail servers from blocking asset saves and avoids silently losing notifications.
- Show a toast that accurately describes delivery state. For queued delivery, show “notification queued”; show “sent” only after confirmed successful delivery. Surface failures through a clear status/history entry and UI notification.
- Add rate limiting/loop protection and avoid sending update emails when no configured tracked field actually changed.

## Implementation phases

### Phase 0 — Baseline and compatibility

1. Add focused tests for the existing asset-type, form, automation, and authentication behavior before changing it.
2. Capture a safe database backup and document the current migration state before applying schema changes.
3. Define the regular-user default permissions, whether any configuration can be shared, and SMTP delivery expectations.

**Exit criteria:** Existing single-admin workflows and records are covered by regression tests; permission defaults and data ownership rules are decided.

### Phase 1 — Fix asset form initialization and empty-state UX

1. Ensure common-form fields are attached to a new asset type before the type’s first form is requested.
2. Preserve fields already configured for an asset type; make initialization idempotent and transactional where needed.
3. Verify the dashboard’s “create type and add asset” flow and the asset-type page’s “Add Asset” flow.
4. If the configured form is genuinely empty, show a clear empty state and a direct route to configure the form rather than a blank grid.

**Acceptance checks:**

- Creating a type from the dashboard and immediately selecting it displays configured common-form fields.
- Creating a type through the type-management flow gives the same initialized form behavior.
- Existing per-type fields and required flags are not unexpectedly replaced.
- An intentionally empty form gives a useful explanation and configuration action.

### Phase 2 — Live form automations

1. Define a shared automation input/output shape for common and asset-type rules.
2. Load active rules with the form (or via one predictable request) and evaluate them in the frontend when relevant source fields change.
3. Update target controls immediately, including date, number, boolean, and dropdown values.
4. Make precedence between common-form and asset-type rules explicit and consistent.
5. Keep backend evaluation and validation on create/update as the source of truth.
6. Add tests for rule order, chained rules, manual override/clear behavior, empty and changed values, and cycle/loop prevention.

**Acceptance checks:**

- Matching rules update dependent fields before the save button is pressed.
- Non-matching rules do not change values.
- Saving produces the same final values as the live preview.
- Direct API calls still apply the rules and validate their results.

### Phase 3 — Multi-user identity and authorization foundation

1. Add user status/role/permission persistence and admin-only user-management endpoints/UI.
2. Backfill current records/configuration to the existing admin.
3. Add owner/scope columns and owner-aware constraints to asset types, definitions, dropdowns, common forms, assets/configuration as selected in the final schema.
4. Add centralized server-side permission checks and ownership-scoped service/query helpers.
5. Update each API surface, including bulk operations, reports, exports, forms, automations, and detail routes.
6. Add frontend permission-aware navigation and actions, while relying on backend authorization for enforcement.
7. Add migration rollback/backup guidance and verify existing admin data remains accessible.

**Acceptance checks:**

- A regular user cannot access another user’s records by changing IDs or calling endpoints directly.
- A user cannot edit another user’s forms, fields, dropdowns, rules, recipients, or report configuration.
- Admin can access all users and grant/revoke permissions.
- Exports and aggregate reports include only records the requesting user may see.
- Existing single-user installation migrates without data loss and remains admin-accessible.

### Phase 4 — Global SMTP and user-scoped email notifications

1. Add admin-only SMTP configuration, encrypted secret storage, and a test-connection/test-email flow.
2. Add permission-gated, owner-scoped email templates, recipients, and event rules.
3. Add transactional outbox and delivery worker/retry handling; include startup/shutdown behavior and operational logging.
4. Add user-scoped history and admin-wide history with useful statuses and filtering.
5. Add accurate queued/sent/failed toasts and notification status refresh.
6. Verify trigger matching for asset creation and configured field updates, including multiple recipient handling and no-op updates.

**Acceptance checks:**

- SMTP credentials are never returned by settings APIs or exposed in client code.
- Only admin can edit global SMTP settings; permitted users can edit only their own notification configuration.
- One user’s rule cannot send using another user’s recipients/template or expose another user’s asset data.
- Create and field-change triggers send the expected message; unchanged/unmatched updates do not.
- Users see only their history; admin can see all history.
- Transient delivery failures retry and remain visible; permanent failures are not reported as successful.

### Phase 5 — Regression, security, and deployment validation

1. Run backend tests, frontend production build, migration checks, and end-to-end flows.
2. Test role/ownership bypass attempts directly against the API.
3. Test with two ordinary users plus admin, including same-named asset types and fields.
4. Test SMTP success/failure, worker restart, retry exhaustion, and history access.
5. Update README/deployment documentation for new environment secrets, migrations, worker operation, and admin setup.

## Cross-cutting test plan

- **Form initialization:** no common fields, existing common fields, removed common fields, inactive fields, newly created type, and type with manually configured fields.
- **Automation:** every supported condition and action; supported field types; overlapping rules; field clearing; client/server result consistency; malformed or stale rule references.
- **Authorization:** each capability allowed and denied; direct API requests; guessed IDs; bulk actions; report/export scope; deactivated accounts.
- **Data isolation:** cross-user asset IDs, asset-type IDs, field IDs, dropdown IDs, common-form IDs, automation IDs, notification IDs, and email-history IDs.
- **Migrations:** fresh database and populated existing single-admin database; rerun/idempotency; backup/restore verification.
- **Email:** valid and invalid SMTP settings, credential secrecy, recipient validation, create/update triggers, retries, duplicate prevention, audit/history scope, and accurate UI statuses.

## Risks and decisions to resolve before implementation

1. **Ownership model:** Decide whether any fields/dropdowns or asset-type schemas are shared across users, or whether every user-created schema is private by default. The requested isolation suggests private-by-default.
2. **Permissions:** Confirm the exact permission combinations and default permissions for new users. A broad “user” role alone may not meet the requested per-action controls.
3. **Admin access:** Specify whether admin edits user configuration in place, can only inspect it, or may do both. The request indicates full rights, so this plan assumes both.
4. **Legacy records:** Existing assets/types/forms are global today. Migration must assign them to the current admin and prevent accidental visibility to new users.
5. **Rule conflicts:** Live evaluation must not silently overwrite manual edits or enter cycles. Precedence and override semantics need explicit tests.
6. **SMTP operations:** SMTP availability and remote-provider limits are outside the app’s control. Queue status and retries must be visible; a “sent” toast cannot be shown before delivery succeeds.
7. **Email security:** Templates and user-provided recipients can expose asset data or enable abuse. Apply ownership checks, permission checks, placeholder restrictions, and sensible send limits.
8. **Deployment:** A background outbox worker needs a documented process model. If the app remains a single container, ensure it starts/stops safely and avoids duplicate workers when scaled.

## Review limitations

This was a source-level architecture and behavior review. No database connection, production deployment, or live SMTP configuration was inspected. No migrations, builds, or tests were run because the requested work was documentation-only and no application code was changed. The diagnosis of the empty add-asset form is based on the reviewed dashboard and server initialization paths and should be confirmed with the reported reproduction before implementing Phase 1.
