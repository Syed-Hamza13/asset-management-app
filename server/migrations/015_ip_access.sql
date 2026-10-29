-- IP allowlist for sign-in and the public Quick Entry form (admin Settings).
-- Both switches default to 'false' and the list starts empty, so this migration
-- changes no behaviour until an admin configures it (fail-open by design).
-- Break-glass if an allowlist ever locks everyone out: set IP_ACCESS_ENFORCE=false.
INSERT IGNORE INTO app_settings (setting_key, setting_value) VALUES
  ('ip_access_login_enabled', 'false'),
  ('ip_access_quick_entry_enabled', 'false'),
  ('ip_access_list', '');
