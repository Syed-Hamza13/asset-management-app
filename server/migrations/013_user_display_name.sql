-- Adds a human-readable display name to users (optional; falls back to the email
-- local-part wherever it is shown). Guarded so re-running is a no-op.
SET @dbname = DATABASE();
SET @tbl = 'users';
SET @col = 'display_name';
SET @sql = (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = @tbl AND COLUMN_NAME = @col) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tbl, ' ADD COLUMN ', @col, ' VARCHAR(100) NULL AFTER email')));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
