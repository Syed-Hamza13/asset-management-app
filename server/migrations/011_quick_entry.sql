-- Feature: Quick Entry — a configurable form shown on the login screen that an
-- unauthenticated visitor can submit. A submission does NOT create an asset; it is
-- stored as a lightweight entry and raises an in-app notification for each recipient
-- the admin configured. Admins enable/disable the form and manage its fields/recipients.
-- Purely additive; no existing tables or rows are modified.

-- Singleton settings row (id = 1).
CREATE TABLE IF NOT EXISTS quick_entry_settings (
  id TINYINT UNSIGNED PRIMARY KEY,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT ck_qes_id CHECK (id = 1)
) ENGINE=InnoDB;

INSERT IGNORE INTO quick_entry_settings (id, enabled) VALUES (1, 0);

-- Extra fields the admin defines (Name and User are fixed in the client, not stored here).
CREATE TABLE IF NOT EXISTS quick_entry_fields (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  label VARCHAR(120) NOT NULL,
  type ENUM('text','multiline') NOT NULL DEFAULT 'text',
  required TINYINT(1) NOT NULL DEFAULT 0,
  display_order INT NOT NULL DEFAULT 0
) ENGINE=InnoDB;

-- Users who receive a notification when the form is submitted.
CREATE TABLE IF NOT EXISTS quick_entry_recipients (
  user_id BIGINT UNSIGNED PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_qer_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- One row per submitted entry. values_json is a snapshot of { fixed + extra } field
-- values at submit time, so later admin edits to the form never rewrite history.
CREATE TABLE IF NOT EXISTS quick_entries (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  submitter_ip VARCHAR(64) NULL,
  values_json MEDIUMTEXT NOT NULL
) ENGINE=InnoDB;

-- In-app notifications. entry_id links back to the originating quick entry (kept
-- nullable + ON DELETE CASCADE so future notification kinds can reuse this table).
CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  kind VARCHAR(32) NOT NULL DEFAULT 'quick_entry',
  entry_id BIGINT UNSIGNED NULL,
  title VARCHAR(200) NOT NULL,
  body MEDIUMTEXT NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_notif_entry FOREIGN KEY (entry_id) REFERENCES quick_entries(id) ON DELETE CASCADE,
  INDEX idx_notif_user_read (user_id, is_read),
  INDEX idx_notif_user_created (user_id, created_at)
) ENGINE=InnoDB;
