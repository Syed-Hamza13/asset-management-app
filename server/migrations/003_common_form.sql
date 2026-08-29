CREATE TABLE IF NOT EXISTS common_forms (
  id TINYINT UNSIGNED PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS common_form_fields (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  common_form_id TINYINT UNSIGNED NOT NULL,
  field_definition_id BIGINT UNSIGNED NOT NULL,
  required BOOLEAN NOT NULL DEFAULT FALSE,
  show_in_list BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INT NOT NULL DEFAULT 0,
  UNIQUE KEY uq_common_form_field (common_form_id, field_definition_id),
  CONSTRAINT fk_common_form_fields_form FOREIGN KEY (common_form_id) REFERENCES common_forms(id) ON DELETE CASCADE,
  CONSTRAINT fk_common_form_fields_definition FOREIGN KEY (field_definition_id) REFERENCES field_definitions(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

INSERT INTO common_forms (id, name) VALUES (1, 'Common Form')
ON DUPLICATE KEY UPDATE name = VALUES(name);
