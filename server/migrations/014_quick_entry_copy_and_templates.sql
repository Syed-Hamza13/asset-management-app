-- Quick Entry: admin-editable form title / sub-heading, per-field placeholder,
-- and custom notification title/body templates. All columns nullable, so existing
-- behaviour is unchanged until an admin fills them in. Guarded => re-runnable.
SET @dbname = DATABASE();

SET @sql = (SELECT IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'quick_entry_settings' AND COLUMN_NAME = 'form_title') > 0, 'SELECT 1', 'ALTER TABLE quick_entry_settings ADD COLUMN form_title VARCHAR(120) NULL'));
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql = (SELECT IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'quick_entry_settings' AND COLUMN_NAME = 'form_subtitle') > 0, 'SELECT 1', 'ALTER TABLE quick_entry_settings ADD COLUMN form_subtitle VARCHAR(255) NULL'));
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql = (SELECT IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'quick_entry_settings' AND COLUMN_NAME = 'notify_title') > 0, 'SELECT 1', 'ALTER TABLE quick_entry_settings ADD COLUMN notify_title VARCHAR(200) NULL'));
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql = (SELECT IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'quick_entry_settings' AND COLUMN_NAME = 'notify_body') > 0, 'SELECT 1', 'ALTER TABLE quick_entry_settings ADD COLUMN notify_body TEXT NULL'));
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql = (SELECT IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'quick_entry_fields' AND COLUMN_NAME = 'placeholder') > 0, 'SELECT 1', 'ALTER TABLE quick_entry_fields ADD COLUMN placeholder VARCHAR(255) NULL'));
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
