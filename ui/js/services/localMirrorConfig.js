/**
 * Local mirror configuration — replaces remote API until backend wiring exists.
 * Add widgets here: same shape as future `/api/widgets/` payloads.
 */

/** @type {Record<string, unknown>} */
export const defaultUserSettings = {
  theme: "mirror-dark",
  accent_color: "#5ee1d9",
  primary_font_size: null,
};

/**
 * Widget grid entries. Positions are 1-based; span = size_rows / size_cols.
 * @type {WidgetConfig[]}
 */
export const defaultWidgetLayouts = [
  {
    widget_id: "clock",
    enabled: true,
    position_row: 1,
    position_col: 1,
    size_rows: 2,
    size_cols: 2,
    options: { refreshIntervalMs: 1000 },
  },
  {
    widget_id: "weather",
    enabled: true,
    position_row: 1,
    position_col: 3,
    size_rows: 2,
    size_cols: 2,
    options: { refreshIntervalMs: 15 * 60 * 1000 },
  },
  {
    widget_id: "calendar",
    enabled: true,
    position_row: 3,
    position_col: 1,
    size_rows: 2,
    size_cols: 4,
    options: { maxEvents: 4, refreshIntervalMs: 5 * 60 * 1000 },
  },
];

export function getLocalUserSettings() {
  return { ...defaultUserSettings };
}

export function getLocalWidgetConfigs() {
  return defaultWidgetLayouts.map((w) => ({ ...w, options: { ...w.options } }));
}

const LAYOUT_STORAGE_KEY = "mirror-widget-layouts";

/**
 * @returns {object[] | null}
 */
export function loadStoredWidgetLayouts() {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * @param {object[]} layouts
 */
export function storeWidgetLayouts(layouts) {
  try {
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layouts));
  } catch {
    /* ignore quota / private mode */
  }
}

/**
 * Defaults merged with saved positions/options per widget_id.
 */
export function getMergedWidgetConfigs() {
  const base = getLocalWidgetConfigs();
  const stored = loadStoredWidgetLayouts();
  if (!stored) return base;
  return base.map((def) => {
    const hit = stored.find((s) => s && s.widget_id === def.widget_id);
    if (!hit) return def;
    return {
      ...def,
      ...hit,
      options: { ...def.options, ...(hit.options || {}) },
    };
  });
}
