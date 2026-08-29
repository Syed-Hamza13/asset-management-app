ALTER TABLE field_definitions MODIFY COLUMN type VARCHAR(30) NOT NULL;

CREATE TABLE IF NOT EXISTS asset_automations (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  asset_type_id BIGINT UNSIGNED NOT NULL,
  source_field_id BIGINT UNSIGNED NOT NULL,
  condition_type VARCHAR(30) NOT NULL,
  condition_value VARCHAR(255) NULL,
  target_field_id BIGINT UNSIGNED NOT NULL,
  action_type VARCHAR(30) NOT NULL,
  action_value VARCHAR(500) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_automation_asset_type FOREIGN KEY (asset_type_id) REFERENCES asset_types(id) ON DELETE CASCADE,
  CONSTRAINT fk_automation_source_field FOREIGN KEY (source_field_id) REFERENCES field_definitions(id) ON DELETE RESTRICT,
  CONSTRAINT fk_automation_target_field FOREIGN KEY (target_field_id) REFERENCES field_definitions(id) ON DELETE RESTRICT,
  INDEX idx_automation_asset_type (asset_type_id)
) ENGINE=InnoDB;
