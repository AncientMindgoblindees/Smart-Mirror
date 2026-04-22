ALTER TABLE widget_config ADD COLUMN mirror_id TEXT;
ALTER TABLE widget_config ADD COLUMN user_id TEXT;

CREATE INDEX IF NOT EXISTS idx_widget_config_mirror_id ON widget_config(mirror_id);
CREATE INDEX IF NOT EXISTS idx_widget_config_user_id ON widget_config(user_id);

ALTER TABLE user_settings ADD COLUMN mirror_id TEXT;
ALTER TABLE user_settings ADD COLUMN user_id TEXT;

CREATE INDEX IF NOT EXISTS idx_user_settings_mirror_id ON user_settings(mirror_id);
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);

ALTER TABLE clothing_item ADD COLUMN user_id TEXT;

CREATE INDEX IF NOT EXISTS idx_clothing_item_user_id ON clothing_item(user_id);

CREATE TABLE IF NOT EXISTS mirrors (
  id TEXT PRIMARY KEY,
  hardware_id TEXT NOT NULL,
  hardware_token_hash TEXT NOT NULL,
  friendly_name TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  synced_at DATETIME
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_mirrors_hardware_id ON mirrors(hardware_id);
CREATE INDEX IF NOT EXISTS idx_mirrors_updated_at ON mirrors(updated_at);

CREATE TABLE IF NOT EXISTS user_profiles (
  id INTEGER PRIMARY KEY,
  user_id TEXT NOT NULL,
  mirror_id TEXT NOT NULL,
  display_name TEXT,
  widget_config TEXT,
  is_active INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  synced_at DATETIME,
  FOREIGN KEY (mirror_id) REFERENCES mirrors(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_profiles_mirror_user ON user_profiles(mirror_id, user_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON user_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_mirror_id ON user_profiles(mirror_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_updated_at ON user_profiles(updated_at);

CREATE TABLE IF NOT EXISTS oauth_credentials (
  id INTEGER PRIMARY KEY,
  mirror_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'google',
  access_token_enc TEXT,
  refresh_token_enc TEXT NOT NULL,
  token_expiry DATETIME,
  scopes TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  synced_at DATETIME,
  FOREIGN KEY (mirror_id) REFERENCES mirrors(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_oauth_credentials_mirror_user_provider
  ON oauth_credentials(mirror_id, user_id, provider);
CREATE INDEX IF NOT EXISTS idx_oauth_credentials_updated_at ON oauth_credentials(updated_at);
CREATE INDEX IF NOT EXISTS idx_oauth_credentials_mirror_id ON oauth_credentials(mirror_id);
CREATE INDEX IF NOT EXISTS idx_oauth_credentials_user_id ON oauth_credentials(user_id);
