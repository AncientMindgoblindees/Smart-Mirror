function cloneValue(value) {
  if (Array.isArray(value)) {
    return value.map(cloneValue);
  }
  if (value && typeof value === "object") {
    const out = {};
    Object.keys(value).forEach((key) => {
      out[key] = cloneValue(value[key]);
    });
    return out;
  }
  return value;
}

const WIDGET_DEFAULT_LAYOUTS = [
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
    options: { refreshIntervalMs: 15 * 60 * 1000, units: "metric" },
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

export function getDefaultWidgetLayouts() {
  return cloneValue(WIDGET_DEFAULT_LAYOUTS);
}

export function getDefaultWidgetLayout(widgetId) {
  const found = WIDGET_DEFAULT_LAYOUTS.find((w) => w.widget_id === widgetId);
  return found ? cloneValue(found) : null;
}
