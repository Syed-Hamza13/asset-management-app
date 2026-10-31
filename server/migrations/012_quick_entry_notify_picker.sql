-- Feature: optional "submitter picks who to notify" dropdown on the Quick Entry form.
-- When notify_picker = 1, the login-screen form shows a multi-select of the admin's
-- configured recipients (by name, not email) and only the chosen users are notified.
-- When 0, all configured recipients are notified automatically (original behavior).
-- Guarded/idempotent ADD COLUMN so re-running is safe on MySQL.

SET @dbname = DATABASE();
SET @tbl = 'quick_entry_settings';
SET @col = 'notify_picker';
SET @sql = (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tbl AND COLUMN_NAME = @col) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tbl, ' ADD COLUMN ', @col, ' TINYINT(1) NOT NULL DEFAULT 0')
));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
