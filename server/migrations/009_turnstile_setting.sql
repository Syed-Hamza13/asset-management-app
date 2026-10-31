-- Turnstile runtime toggle (admin, in Settings).
-- Default 'true' preserves the previous production behaviour (verification is
-- enforced whenever TURNSTILE_SECRET_KEY is configured). In non-production the
-- server already bypasses verification, so this flag has no effect there.
INSERT IGNORE INTO app_settings (setting_key, setting_value) VALUES ('turnstile_enabled', 'true');
