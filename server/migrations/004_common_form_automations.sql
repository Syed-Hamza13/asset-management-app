CREATE TABLE IF NOT EXISTS common_form_automations (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  common_form_id TINYINT UNSIGNED NOT NULL,
  source_field_id BIGINT UNSIGNED NOT NULL,
  condition_type VARCHAR(30) NOT NULL,
  condition_value VARCHAR(255) NULL,
  target_field_id BIGINT UNSIGNED NOT NULL,
  action_type VARCHAR(30) NOT NULL,
  action_value VARCHAR(500) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_common_automation_form FOREIGN KEY (common_form_id) REFERENCES common_forms(id) ON DELETE CASCADE,
  CONSTRAINT fk_common_automation_source FOREIGN KEY (source_field_id) REFERENCES field_definitions(id) ON DELETE RESTRICT,
  CONSTRAINT fk_common_automation_target FOREIGN KEY (target_field_id) REFERENCES field_definitions(id) ON DELETE RESTRICT,
  INDEX idx_common_form_automation (common_form_id)
) ENGINE=InnoDB;
