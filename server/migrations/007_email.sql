-- Phase 4: global SMTP configuration + per-user email templates, recipients,
-- rules, and a transactional outbox (also used as delivery history).

CREATE TABLE IF NOT EXISTS smtp_settings (
  id TINYINT UNSIGNED NOT NULL DEFAULT 1,
  host VARCHAR(255) NOT NULL DEFAULT '',
  port INT NOT NULL DEFAULT 587,
  secure BOOLEAN NOT NULL DEFAULT FALSE,
  username VARCHAR(255) NOT NULL DEFAULT '',
  password_encrypted TEXT NULL,
  from_email VARCHAR(255) NOT NULL DEFAULT '',
  from_name VARCHAR(255) NOT NULL DEFAULT '',
  reply_to VARCHAR(255) NOT NULL DEFAULT '',
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT chk_smtp_single_row CHECK (id = 1)
) ENGINE=InnoDB;

INSERT IGNORE INTO smtp_settings (id) VALUES (1);

CREATE TABLE IF NOT EXISTS email_templates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  owner_user_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(150) NOT NULL,
  subject_template VARCHAR(500) NOT NULL,
  body_template TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_email_templates_owner FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_email_templates_owner (owner_user_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS email_recipients (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  owner_user_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(150) NOT NULL DEFAULT '',
  email VARCHAR(255) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_email_recipients_owner FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_email_recipients_owner (owner_user_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS email_rules (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  owner_user_id BIGINT UNSIGNED NOT NULL,
  asset_type_id BIGINT UNSIGNED NOT NULL,
  trigger_type ENUM('asset_created','field_changed') NOT NULL,
  trigger_field_id BIGINT UNSIGNED NULL,
  trigger_condition ENUM('any_change','equals','not_equals','filled','empty') NULL,
  trigger_condition_value VARCHAR(255) NULL,
  template_id BIGINT UNSIGNED NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_email_rules_owner FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_email_rules_type FOREIGN KEY (asset_type_id) REFERENCES asset_types(id) ON DELETE CASCADE,
  CONSTRAINT fk_email_rules_template FOREIGN KEY (template_id) REFERENCES email_templates(id) ON DELETE RESTRICT,
  INDEX idx_email_rules_owner_type (owner_user_id, asset_type_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS email_rule_recipients (
  rule_id BIGINT UNSIGNED NOT NULL,
  recipient_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (rule_id, recipient_id),
  CONSTRAINT fk_err_rule FOREIGN KEY (rule_id) REFERENCES email_rules(id) ON DELETE CASCADE,
  CONSTRAINT fk_err_recipient FOREIGN KEY (recipient_id) REFERENCES email_recipients(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS email_outbox (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  owner_user_id BIGINT UNSIGNED NOT NULL,
  rule_id BIGINT UNSIGNED NULL,
  asset_public_id VARCHAR(64) NULL,
  event_type VARCHAR(40) NOT NULL,
  payload_json JSON NOT NULL,
  template_snapshot_json JSON NOT NULL,
  recipients_json JSON NOT NULL,
  status ENUM('pending','sending','sent','failed','cancelled') NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  next_attempt_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_error TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at DATETIME NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_email_outbox_owner FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_email_outbox_rule FOREIGN KEY (rule_id) REFERENCES email_rules(id) ON DELETE SET NULL,
  INDEX idx_outbox_worker (status, next_attempt_at),
  INDEX idx_outbox_owner (owner_user_id, created_at)
) ENGINE=InnoDB;
