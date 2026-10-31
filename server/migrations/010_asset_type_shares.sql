-- Feature: Super-admin sharing of asset types with other users.
-- A shared asset type (and its form, attached common fields, automation rules and
-- field definitions) becomes visible and usable by the users it is shared with,
-- while structural edits remain restricted to the type owner and admins.
-- Purely additive: existing single-owner behavior is unchanged when no shares exist.

CREATE TABLE IF NOT EXISTS asset_type_shares (
  asset_type_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (asset_type_id, user_id),
  CONSTRAINT fk_ats_type FOREIGN KEY (asset_type_id) REFERENCES asset_types(id) ON DELETE CASCADE,
  CONSTRAINT fk_ats_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_ats_user (user_id)
) ENGINE=InnoDB;
