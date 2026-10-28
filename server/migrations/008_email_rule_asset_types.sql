-- Phase 4 extension: allow a single email rule to target multiple asset types.
-- email_rules.asset_type_id stays as the rule's "primary" type (kept NOT NULL +
-- FK for backward compatibility and simple ownership/display). The full set of
-- types a rule applies to now lives in this join table, backfilled from the
-- existing single-type rows so current rules keep firing exactly as before.

CREATE TABLE IF NOT EXISTS email_rule_asset_types (
  rule_id BIGINT UNSIGNED NOT NULL,
  asset_type_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (rule_id, asset_type_id),
  CONSTRAINT fk_erat_rule FOREIGN KEY (rule_id) REFERENCES email_rules(id) ON DELETE CASCADE,
  CONSTRAINT fk_erat_type FOREIGN KEY (asset_type_id) REFERENCES asset_types(id) ON DELETE CASCADE,
  INDEX idx_erat_type (asset_type_id),
  INDEX idx_erat_rule (rule_id)
) ENGINE=InnoDB;

INSERT IGNORE INTO email_rule_asset_types (rule_id, asset_type_id)
SELECT id, asset_type_id FROM email_rules;
