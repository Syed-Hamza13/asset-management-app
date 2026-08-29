ALTER TABLE asset_type_fields
ADD COLUMN show_in_list TINYINT(1) NOT NULL DEFAULT 1 AFTER required;