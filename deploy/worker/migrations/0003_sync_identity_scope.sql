ALTER TABLE mirrors ADD COLUMN claimed_by_user_uid TEXT;
ALTER TABLE mirrors ADD COLUMN claimed_at DATETIME;

ALTER TABLE user_profiles ADD COLUMN sync_id TEXT;
ALTER TABLE user_profiles ADD COLUMN deleted_at DATETIME;

ALTER TABLE widget_config ADD COLUMN sync_id TEXT;
ALTER TABLE widget_config ADD COLUMN deleted_at DATETIME;

ALTER TABLE user_settings ADD COLUMN sync_id TEXT;
ALTER TABLE user_settings ADD COLUMN deleted_at DATETIME;

UPDATE user_profiles
SET sync_id = COALESCE(sync_id, 'sync_user_profiles_' || id)
WHERE sync_id IS NULL OR TRIM(sync_id) = '';

UPDATE widget_config
SET sync_id = COALESCE(sync_id, 'sync_widget_config_' || id)
WHERE sync_id IS NULL OR TRIM(sync_id) = '';

UPDATE user_settings
SET sync_id = COALESCE(sync_id, 'sync_user_settings_' || id)
WHERE sync_id IS NULL OR TRIM(sync_id) = '';

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_profiles_sync_id ON user_profiles(sync_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_widget_config_sync_id ON widget_config(sync_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_settings_sync_id ON user_settings(sync_id);

CREATE INDEX IF NOT EXISTS idx_user_profiles_deleted_at ON user_profiles(deleted_at);
CREATE INDEX IF NOT EXISTS idx_widget_config_deleted_at ON widget_config(deleted_at);
CREATE INDEX IF NOT EXISTS idx_user_settings_deleted_at ON user_settings(deleted_at);
