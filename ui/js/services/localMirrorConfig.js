/**
 * Local mirror configuration — replaces remote API until backend wiring exists.
 * Add widgets here: same shape as future `/api/widgets/` payloads.
 */
import { getDefaultWidgetLayouts } from "../widgets/defaultLayouts.js";

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
export const defaultWidgetLayouts = getDefaultWidgetLayouts();

export function getLocalUserSettings() {
  return { ...defaultUserSettings };
}

export function getLocalWidgetConfigs() {
  return getDefaultWidgetLayouts();
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
