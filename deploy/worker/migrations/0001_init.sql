CREATE TABLE IF NOT EXISTS widget_config (
  id INTEGER PRIMARY KEY,
  widget_id TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  position_row INTEGER NOT NULL DEFAULT 1,
  position_col INTEGER NOT NULL DEFAULT 1,
  size_rows INTEGER NOT NULL DEFAULT 1,
  size_cols INTEGER NOT NULL DEFAULT 1,
  config_json TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  synced_at DATETIME
);

CREATE INDEX IF NOT EXISTS idx_widget_config_widget_id ON widget_config(widget_id);
CREATE INDEX IF NOT EXISTS idx_widget_config_updated_at ON widget_config(updated_at);

CREATE TABLE IF NOT EXISTS user_settings (
  id INTEGER PRIMARY KEY,
  theme TEXT NOT NULL DEFAULT 'dark',
  primary_font_size INTEGER NOT NULL DEFAULT 72,
  accent_color TEXT NOT NULL DEFAULT '#4a9eff',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  synced_at DATETIME
);

CREATE INDEX IF NOT EXISTS idx_user_settings_updated_at ON user_settings(updated_at);

CREATE TABLE IF NOT EXISTS clothing_item (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  color TEXT,
  season TEXT,
  notes TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  synced_at DATETIME
);

CREATE INDEX IF NOT EXISTS idx_clothing_item_updated_at ON clothing_item(updated_at);

CREATE TABLE IF NOT EXISTS clothing_image (
  id INTEGER PRIMARY KEY,
  clothing_item_id INTEGER NOT NULL,
  storage_provider TEXT NOT NULL DEFAULT 'cloud',
  storage_key TEXT NOT NULL,
  image_url TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  synced_at DATETIME,
  FOREIGN KEY (clothing_item_id) REFERENCES clothing_item(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_clothing_image_item_id ON clothing_image(clothing_item_id);
CREATE INDEX IF NOT EXISTS idx_clothing_image_created_at ON clothing_image(created_at);
