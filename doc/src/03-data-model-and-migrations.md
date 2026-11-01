---
title: "03 — Data Model and Migrations"
---

# Facts used in this document

Verified against a live database, read-only, on 2026-11-01:

| Check | Result |
| --- | --- |
| Tables in the schema | **28** (list below) |
| `sessions` DDL | `session_id varchar(128) utf8mb4_bin PK`, `expires int unsigned`, `data mediumtext`, InnoDB |
| `schema_migrations` DDL | `id int unsigned PK AUTO_INCREMENT`, `name varchar(255) UNIQUE`, `applied_at timestamp DEFAULT CURRENT_TIMESTAMP` |
| ENUM columns | 5 — see *Enums* |
| Engine / charset | InnoDB, `utf8mb4` |

The 28 tables: `app_settings`, `asset_automations`, `asset_type_fields`,
`asset_type_shares`, `asset_types`, `assets`, `common_form_automations`,
`common_form_fields`, `common_forms`, `dropdown_options`, `dropdowns`,
`email_outbox`, `email_recipients`, `email_rule_asset_types`,
`email_rule_recipients`, `email_rules`, `email_templates`,
`field_definitions`, `notifications`, `quick_entries`, `quick_entry_fields`,
`quick_entry_recipients`, `quick_entry_settings`, `schema_migrations`,
`sessions`, `smtp_settings`, `user_permissions`, `users`.

# Naming and modelling conventions

| Convention | Reason |
| --- | --- |
| Table names singular snake_case, join tables `<a>_<b>` with a composite PK | Predictable SQL; join rows have no identity of their own |
| `owner_user_id` on every user-owned table, `NOT NULL`, `ON DELETE CASCADE` | This single column implements "private by default" |
| Uniqueness is **per owner**: `UNIQUE(owner_user_id, slug)` / `(owner_user_id, key)` | Two users may each have a field called `serial_no` |
| Records are addressed externally by `public_id CHAR(36)` (UUID), never by the numeric `id` | Nothing leaks how many records exist |
| Flexible data is a JSON column (`values_json`), stable data is a real column | Fields are user-defined, so they cannot be columns; ownership, status and timestamps can be |
| Ordering by `display_order`, created rows by `created_at DESC` | Manual order for forms/lists, stable order for pagination |
| Soft delete (`is_active = 0`) for fields, dropdowns, options, templates, recipients, rules | History and existing values must keep resolving |
| Singleton config tables use `id TINYINT` with `CHECK (id = 1)` | `smtp_settings`, `quick_entry_settings` |

# Entity map

```
users ─┬─ user_permissions (capability grants)
       ├─ sessions (runtime store, not migrated)
       ├─ owns ──► asset_types ─┬─ asset_type_fields ──► field_definitions
       │                        ├─ asset_automations  (source/target field)
       │                        ├─ asset_type_shares  (shared with another user)
       │                        └─ assets (values_json)
       ├─ owns ──► dropdowns ───► dropdown_options        ◄── field_definitions.dropdown_id
       ├─ owns ──► common_forms ─┬─ common_form_fields ───► field_definitions
       │                         └─ common_form_automations
       ├─ owns ──► email_templates / email_recipients / email_rules
       │                              email_rules ─┬─ email_rule_asset_types ──► asset_types
       │                                          └─ email_rule_recipients ───► email_recipients
       ├─ receives ─► notifications ──► quick_entries
       └─ receives ─► quick_entry_recipients

app_settings (key/value: branding, turnstile_enabled, ip_access_*)
smtp_settings (one row)      quick_entry_settings (one row)  + quick_entry_fields
email_outbox (owner + rule + snapshot; also the delivery history)
schema_migrations (migration ledger)
```

# Table reference

## Accounts and platform

| Table | Purpose | Key columns | Relations / notes |
| --- | --- | --- | --- |
| `users` | Accounts | `email` UNIQUE, `password_hash`, `role ENUM('admin','user')`, `is_active`, `must_change_password`, `display_name VARCHAR(100)` | `display_name` is what Quick Entry and the notify picker show; falls back to the email local-part |
| `user_permissions` | Capability grants | PK `(user_id, capability)` | `user_id` → `users` ON DELETE CASCADE. Admins are not stored here; they bypass the table |
| `sessions` | Session store | `session_id` PK, `expires`, `data` | Created and cleaned by `express-mysql-session`, **not** by a migration. `clearExpired: true`, sweep every 15 min, expiry = `SESSION_MAX_AGE_MS` |
| `app_settings` | Key/value settings | `setting_key` PK, `setting_value MEDIUMTEXT` | Holds `favicon_data_url`, `app_icon_data_url`, `turnstile_enabled`, `ip_access_login_enabled`, `ip_access_quick_entry_enabled`, `ip_access_list` |
| `schema_migrations` | Migration ledger | `name` UNIQUE, `applied_at` | Written only after a file's SQL succeeds |

## Asset structure

| Table | Purpose | Key columns | Relations / notes |
| --- | --- | --- | --- |
| `asset_types` | Categories | `name`, `slug`, `owner_user_id` | `UNIQUE(owner_user_id, slug)`; type → `users` CASCADE |
| `field_definitions` | Reusable fields | `name`, `key`, `type VARCHAR(30)`, `dropdown_id`, `is_active`, `owner_user_id` | `UNIQUE(owner_user_id, key)`; `dropdown_id` → `dropdowns` ON DELETE **SET NULL**; `key` immutable after create |
| `asset_type_fields` | Type ↔ field | `required`, `show_in_list TINYINT(1) DEFAULT 1`, `display_order` | PK-less join with `UNIQUE(asset_type_id, field_definition_id)`; type → CASCADE, field → **RESTRICT** (cannot delete a field that is still on a form) |
| `dropdowns` | Option lists | `name`, `slug`, `is_active`, `owner_user_id` | `UNIQUE(owner_user_id, slug)` |
| `dropdown_options` | Options | `label`, `value`, `display_order`, `is_active` | `UNIQUE(dropdown_id, value)`; dropdown → RESTRICT |
| `assets` | Records | `public_id CHAR(36)` UNIQUE, `values_json JSON`, `owner_user_id` | type → RESTRICT; index `(owner_user_id, asset_type_id, created_at)` |
| `asset_automations` | Per-type rules | `source_field_id`, `condition`, `condition_value`, `target_field_id`, `action`, `action_value`, `is_active` | type → CASCADE; both fields → RESTRICT. `condition`/`action` are VARCHAR, validated in code against the shared contract |

## Common form

| Table | Purpose | Key columns | Relations / notes |
| --- | --- | --- | --- |
| `common_forms` | One base form per user | `name`, `owner_user_id` | `UNIQUE(owner_user_id)`. Started as `id TINYINT` non-auto (003), widened to `BIGINT AUTO_INCREMENT` in 006 |
| `common_form_fields` | Form ↔ field | `required`, `show_in_list`, `display_order` | form → CASCADE, field → RESTRICT |
| `common_form_automations` | Base-form rules | same shape as `asset_automations`, `common_form_id` | Runs **before** type rules |

Common fields are auto-attached to every asset type the owner creates
(`attachCommonFields`, `syncCommonFieldOrder`), and `quantity` fields are forced
to `show_in_list = 0`.

## Email

| Table | Purpose | Key columns | Relations / notes |
| --- | --- | --- | --- |
| `smtp_settings` | The single global SMTP account | `host`, `port` (587), `secure`, `username`, `password_encrypted`, `from_email`, `from_name`, `reply_to`, `enabled` | `id TINYINT CHECK (id = 1)`. `password_encrypted` = `iv:tag:ciphertext` (base64), AES-256-GCM |
| `email_templates` | Per-user message bodies | `name`, `subject_template`, `body_template`, `is_active`, `owner_user_id` | owner → CASCADE |
| `email_recipients` | Per-user address book | `name`, `email`, `is_active`, `owner_user_id` | owner → CASCADE |
| `email_rules` | What fires and what to send | `trigger_type ENUM('asset_created','field_changed')`, `trigger_field_id`, `trigger_condition ENUM('any_change','equals','not_equals','filled','empty')`, `trigger_condition_value`, `template_id`, `asset_type_id` (primary type), `is_active`, `owner_user_id` | template → RESTRICT; the legacy single `asset_type_id` is kept for readability, the real set lives in the join table |
| `email_rule_asset_types` | Rule ↔ many types | PK `(rule_id, asset_type_id)` | both → CASCADE |
| `email_rule_recipients` | Rule ↔ recipients | PK `(rule_id, recipient_id)` | both → CASCADE |
| `email_outbox` | Transactional outbox **and** delivery history | `event_type`, `asset_public_id`, `payload_json`, `template_snapshot_json`, `recipients_json`, `status ENUM('pending','sending','sent','failed','cancelled')`, `attempts`, `next_attempt_at`, `last_error`, `sent_at`, `owner_user_id`, `rule_id` | rule → ON DELETE SET NULL (history survives rule deletion). Templates are **snapshotted**, so editing a template does not rewrite what was already queued |

`cancelled` exists in the ENUM but no code path sets it today.

## Quick Entry and notifications

| Table | Purpose | Key columns | Relations / notes |
| --- | --- | --- | --- |
| `quick_entry_settings` | Public form config | `enabled`, `notify_picker`, `form_title`, `form_subtitle`, `notify_title`, `notify_body` | `id TINYINT CHECK (id = 1)` |
| `quick_entry_fields` | Its questions | `label`, `type ENUM('text','multiline')`, `placeholder`, `required`, `display_order` | Capped at **15** fields; label ≤ 200, multiline value ≤ 2000 |
| `quick_entry_recipients` | Who may be notified | `user_id` PK | Only active users can be inserted |
| `quick_entries` | Submissions | `values_json MEDIUMTEXT` (snapshot incl. `{fields:[{id,label,type,value}], message?}`), `submitter_ip` | Never becomes an asset |
| `notifications` | In-app bell rows | `user_id`, `kind` (default `'quick_entry'`), `entry_id`, `title`, `body`, `is_read` | entry → CASCADE; read endpoints are scoped by `user_id`, foreign id → `404` |

## Shapes stored inside the JSON columns

| Column | Shape |
| --- | --- |
| `assets.values_json` | `{ "<field_key>": <value> }` — strings for text/multilines/dates/mobile, numbers for `number`/`quantity`, booleans for `boolean`, dropdown option `value` strings for `dropdown`; an empty field may be absent or `""` |
| `quick_entries.values_json` | `{ fields: [{ id, label, type, value }], message? }` — a *snapshot with labels*, so an old submission stays readable even after the field is renamed |
| `email_outbox.payload_json` | The placeholder context at enqueue time (`asset_type_name`, `asset_public_id`, `created_at`, `updated_at`, `user.email`, `user.name`, `field.<key>`, `field.<key>.previous`) |
| `email_outbox.template_snapshot_json` | The rule's template subject/body as it was when queued |
| `email_outbox.recipients_json` | The resolved email address list |

# Enums and their exact stored values

| Where | Values |
| --- | --- |
| `users.role` | `admin`, `user` |
| `email_rules.trigger_type` | `asset_created`, `field_changed` |
| `email_rules.trigger_condition` | `any_change`, `equals`, `not_equals`, `filled`, `empty` |
| `email_outbox.status` | `pending`, `sending`, `sent`, `failed`, `cancelled` |
| `quick_entry_fields.type` | `text`, `multiline` |
| `field_definitions.type` (VARCHAR(30), validated in code) | `text`, `multiline`, `number`, `boolean`, `date`, `auto_date`, `dropdown`, `quantity`, `mobile` |
| automation `condition` (VARCHAR, shared contract) | `filled`, `empty`, `changed`, `equals` |
| automation `action` (VARCHAR, shared contract) | `set_value`, `set_today`, `clear` |

# How the migration runner works

`server/src/config/migrate.js`, called from `server.js` **before** `app.listen`:

1. Open a **dedicated single connection** (not the pool) with
   `multipleStatements: true`.
2. `CREATE TABLE IF NOT EXISTS schema_migrations`.
3. Read `server/migrations/*.sql`, sort by **filename** (all names are
   zero-padded, so lexicographic order equals numeric order and `999` is last).
4. For each file: `SELECT id FROM schema_migrations WHERE name = ? LIMIT 1` →
   found = **skip**; not found = run the whole file, and **only on success**
   insert the row and log `Applied migration: <name>`.
5. Close the connection in `finally`.

Three consequences to design around:

| Fact | What it means for you |
| --- | --- |
| The skip test is on **name**, not on content | Never edit a migration that has already run anywhere. Change the file and the ledger still says "applied", so production silently keeps the old schema. New change = new numbered file |
| Recording happens after success | A file killed mid-way is re-run in full on the next boot. Idempotent files absorb that; plain `ALTER` files fail with `ER_DUP_FIELDNAME` / `ER_DUPKEY_NAME`, which is a **boot loop, not data loss** — fix by inserting the missing row |
| MySQL DDL auto-commits | You cannot wrap `ALTER`s in a transaction to make a file atomic |

Restart safety was measured, not assumed: two consecutive `runMigrations()`
calls against a live database produced **0** `Applied migration` lines (240.6 ms
and 250.5 ms) and identical row snapshots afterwards.

# Migration inventory

| File | What it does | Safe to re-run? |
| --- | --- | --- |
| `001_initial.sql` | `CREATE TABLE IF NOT EXISTS`: users, asset_types, dropdowns, dropdown_options, field_definitions, asset_type_fields, assets | Yes |
| `002_automations.sql` | `ALTER TABLE field_definitions MODIFY type VARCHAR(30)`; creates `asset_automations` | MODIFY is plain but re-applies harmlessly |
| `003_common_form.sql` | Creates `common_forms`, `common_form_fields`; seeds row `1 'Common Form'` | Yes (`ON DUPLICATE KEY`) |
| `004_common_form_automations.sql` | Creates `common_form_automations` | Yes |
| `005_branding.sql` | Creates `app_settings`; seeds the two branding keys `INSERT IGNORE` | Yes |
| `006_multiuser.sql` | Adds `role` / `is_active` / `must_change_password` + `UPDATE users SET role='admin'`; creates `user_permissions`; adds `owner_user_id` to asset_types, dropdowns, field_definitions, assets, common_forms with backfill `= (SELECT MIN(id) FROM users)`; drops the old global `slug` index, adds owner-scoped uniques and FKs; widens `common_forms.id` to BIGINT AUTO_INCREMENT | **No** — plain `ALTER` / `DROP INDEX` / constraint churn |
| `007_email.sql` | Creates `smtp_settings` (+ seed row), `email_templates`, `email_recipients`, `email_rules`, `email_rule_recipients`, `email_outbox` | Yes |
| `008_email_rule_asset_types.sql` | Creates the rule↔type join table and backfills it from `email_rules.asset_type_id` | Yes |
| `009_turnstile_setting.sql` | Seeds `turnstile_enabled = 'true'` | Yes |
| `010_asset_type_shares.sql` | Creates `asset_type_shares` | Yes |
| `011_quick_entry.sql` | Creates `quick_entry_settings` (+ seed), `quick_entry_fields`, `quick_entry_recipients`, `quick_entries`, `notifications` | Yes |
| `012_quick_entry_notify_picker.sql` | Adds `notify_picker` | Yes — guarded through `information_schema` + `PREPARE`/`EXECUTE` |
| `013_user_display_name.sql` | Adds `users.display_name VARCHAR(100)` | Yes — guarded |
| `014_quick_entry_copy_and_templates.sql` | Adds `form_title`, `form_subtitle`, `notify_title`, `notify_body`, `quick_entry_fields.placeholder` | Yes — guarded |
| `015_ip_access.sql` | Seeds `ip_access_login_enabled='false'`, `ip_access_quick_entry_enabled='false'`, `ip_access_list=''` | Yes |
| `016_remove_foreign_common_field_rows.sql` | Data repair: deletes `asset_type_fields` rows where the field's owner differs from the type's owner | Yes — a re-run matches nothing |
| `999_add_asset_list_columns.sql` | Adds `asset_type_fields.show_in_list TINYINT(1) NOT NULL DEFAULT 1` | **No** — plain `ADD COLUMN` |

Deliberate choices inside these files:

- `006` assigns **all pre-existing records** to the earliest user, so a single-user
  installation upgrades to multi-user without losing ownership.
- No migration contains `DROP TABLE`, `TRUNCATE`, `RENAME TABLE` or `DROP COLUMN`.
  The only destructive statement in the set is `016`'s targeted `DELETE` of rows
  that could never have been valid.
- New tables always arrive with `CREATE TABLE IF NOT EXISTS`.

# Writing a new migration

1. File name: next zero-padded number + a snake_case description, e.g.
   `017_asset_notes.sql`. It is sorted as a **string**, so keep the padding.
2. Write it to be re-runnable. MySQL has no `ADD COLUMN IF NOT EXISTS` in 8.0,
   so use the pattern already in `012`–`014`:

```sql
SET @sql := (
  SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE()
             AND TABLE_NAME = 'asset_types' AND COLUMN_NAME = 'notes'),
    'SELECT 1',
    'ALTER TABLE asset_types ADD COLUMN notes TEXT NULL AFTER slug'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
```

3. `CREATE TABLE IF NOT EXISTS` for new tables; `INSERT IGNORE` for seeds.
4. Never touch an existing applied file. Never reformat one.
5. Backfill in the same file when you add a `NOT NULL` column, using a
   documented default (as `006` did with `MIN(id)`).
6. Take a `mysqldump` first, run the file against a copy, and confirm a second
   run changes nothing.

# Backup and restore

```bash
# back up (always, before starting the app on a new version)
mysqldump -h <DB_HOST> -P 3306 -u <DB_USER> -p <DB_NAME> > backup-$(date +%F).sql

# restore into an empty schema
mysql -h <DB_HOST> -P 3306 -u <DB_USER> -p <DB_NAME> < backup-2026-11-01.sql
```

Backups land in `backups/`, which is gitignored for a reason — dumps contain
password hashes, SMTP ciphertext and real user data. There is no automated
backup job in the codebase; the command above is the documented procedure.
