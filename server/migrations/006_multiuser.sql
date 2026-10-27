-- Phase 3: multi-user identity, ownership, and authorization.
-- All existing rows are backfilled to the existing (admin) account.

ALTER TABLE users
  ADD COLUMN role ENUM('admin','user') NOT NULL DEFAULT 'user',
  ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT FALSE;

-- Every account in the pre-multi-user installation is the admin.
UPDATE users SET role = 'admin';

CREATE TABLE IF NOT EXISTS user_permissions (
  user_id BIGINT UNSIGNED NOT NULL,
  capability VARCHAR(80) NOT NULL,
  PRIMARY KEY (user_id, capability),
  CONSTRAINT fk_user_permissions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- asset_types: owner-scoped uniqueness
ALTER TABLE asset_types ADD COLUMN owner_user_id BIGINT UNSIGNED NULL;
UPDATE asset_types SET owner_user_id = (SELECT MIN(id) FROM users);
ALTER TABLE asset_types MODIFY owner_user_id BIGINT UNSIGNED NOT NULL;
ALTER TABLE asset_types DROP INDEX slug;
ALTER TABLE asset_types
  ADD CONSTRAINT fk_asset_types_owner FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
  ADD UNIQUE KEY uq_asset_types_owner_slug (owner_user_id, slug);

-- dropdowns: owner-scoped uniqueness
ALTER TABLE dropdowns ADD COLUMN owner_user_id BIGINT UNSIGNED NULL;
UPDATE dropdowns SET owner_user_id = (SELECT MIN(id) FROM users);
ALTER TABLE dropdowns MODIFY owner_user_id BIGINT UNSIGNED NOT NULL;
ALTER TABLE dropdowns DROP INDEX slug;
ALTER TABLE dropdowns
  ADD CONSTRAINT fk_dropdowns_owner FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
  ADD UNIQUE KEY uq_dropdowns_owner_slug (owner_user_id, slug);

-- field_definitions: owner-scoped uniqueness
ALTER TABLE field_definitions ADD COLUMN owner_user_id BIGINT UNSIGNED NULL;
UPDATE field_definitions SET owner_user_id = (SELECT MIN(id) FROM users);
ALTER TABLE field_definitions MODIFY owner_user_id BIGINT UNSIGNED NOT NULL;
ALTER TABLE field_definitions DROP INDEX `key`;
ALTER TABLE field_definitions
  ADD CONSTRAINT fk_field_definitions_owner FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
  ADD UNIQUE KEY uq_field_definitions_owner_key (owner_user_id, `key`);

-- assets: denormalized owner for fast scoping (public_id stays globally unique)
ALTER TABLE assets ADD COLUMN owner_user_id BIGINT UNSIGNED NULL;
UPDATE assets SET owner_user_id = (SELECT MIN(id) FROM users);
ALTER TABLE assets MODIFY owner_user_id BIGINT UNSIGNED NOT NULL;
ALTER TABLE assets
  ADD CONSTRAINT fk_assets_owner FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
  ADD INDEX idx_assets_owner (owner_user_id, asset_type_id, created_at);

-- common_forms: one per user, auto-increment PK (children FKs must be rebuilt for the type change)
ALTER TABLE common_form_fields DROP FOREIGN KEY fk_common_form_fields_form;
ALTER TABLE common_form_automations DROP FOREIGN KEY fk_common_automation_form;
ALTER TABLE common_forms MODIFY id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT;
ALTER TABLE common_form_fields MODIFY common_form_id BIGINT UNSIGNED NOT NULL;
ALTER TABLE common_form_automations MODIFY common_form_id BIGINT UNSIGNED NOT NULL;
ALTER TABLE common_form_fields
  ADD CONSTRAINT fk_common_form_fields_form FOREIGN KEY (common_form_id) REFERENCES common_forms(id) ON DELETE CASCADE;
ALTER TABLE common_form_automations
  ADD CONSTRAINT fk_common_automation_form FOREIGN KEY (common_form_id) REFERENCES common_forms(id) ON DELETE CASCADE;
ALTER TABLE common_forms ADD COLUMN owner_user_id BIGINT UNSIGNED NULL;
UPDATE common_forms SET owner_user_id = (SELECT MIN(id) FROM users);
ALTER TABLE common_forms
  MODIFY owner_user_id BIGINT UNSIGNED NOT NULL,
  ADD UNIQUE KEY uq_common_forms_owner (owner_user_id),
  ADD CONSTRAINT fk_common_forms_owner FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE;
