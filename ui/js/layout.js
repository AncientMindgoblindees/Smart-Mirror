const GRID_ID = "mirror-grid";
const DEFAULT_ZONE_MAP = {
  clock: "hero",
  weather: "right-top",
  calendar: "right-stack",
};
const LEGACY_SLOT_MAP = {
  "hero-left": "hero",
  "top-right": "right-top",
  "right-rail": "right-stack",
};
const ZONE_LIMITS = {
  hero: { colSpan: 2, rowSpan: 4 },
  "right-top": { colSpan: 2, rowSpan: 3 },
  "right-stack": { colSpan: 3, rowSpan: 4 },
  ambient: { colSpan: 3, rowSpan: 3 },
  edge: { colSpan: 4, rowSpan: 2 },
};
const LAYOUT_TEMPLATES = {
  home: [
    { zone: "hero", colStart: 1, colSpan: 4, rowStart: 1, rowSpan: 7, columns: 2, emphasis: "primary" },
    { zone: "right-top", colStart: 5, colSpan: 2, rowStart: 1, rowSpan: 5, columns: 2, emphasis: "secondary" },
    { zone: "right-stack", colStart: 5, colSpan: 2, rowStart: 6, rowSpan: 7, columns: 2, emphasis: "secondary" },
    { zone: "ambient", colStart: 1, colSpan: 4, rowStart: 8, rowSpan: 6, columns: 2, emphasis: "tertiary" },
    { zone: "edge", colStart: 1, colSpan: 6, rowStart: 17, rowSpan: 2, columns: 4, emphasis: "muted" },
  ],
  "weather-focus": [
    { zone: "hero", colStart: 1, colSpan: 3, rowStart: 1, rowSpan: 6, columns: 2, emphasis: "secondary" },
    { zone: "right-top", colStart: 4, colSpan: 3, rowStart: 1, rowSpan: 8, columns: 2, emphasis: "primary" },
    { zone: "right-stack", colStart: 4, colSpan: 3, rowStart: 9, rowSpan: 5, columns: 2, emphasis: "secondary" },
    { zone: "ambient", colStart: 1, colSpan: 3, rowStart: 7, rowSpan: 7, columns: 2, emphasis: "tertiary" },
    { zone: "edge", colStart: 1, colSpan: 6, rowStart: 17, rowSpan: 2, columns: 4, emphasis: "muted" },
  ],
  "agenda-focus": [
    { zone: "hero", colStart: 1, colSpan: 3, rowStart: 1, rowSpan: 5, columns: 2, emphasis: "secondary" },
    { zone: "right-top", colStart: 4, colSpan: 3, rowStart: 1, rowSpan: 4, columns: 2, emphasis: "tertiary" },
    { zone: "right-stack", colStart: 1, colSpan: 6, rowStart: 6, rowSpan: 8, columns: 3, emphasis: "primary" },
    { zone: "ambient", colStart: 1, colSpan: 6, rowStart: 14, rowSpan: 3, columns: 3, emphasis: "secondary" },
    { zone: "edge", colStart: 1, colSpan: 6, rowStart: 17, rowSpan: 2, columns: 4, emphasis: "muted" },
  ],
  minimal: [
    { zone: "hero", colStart: 1, colSpan: 6, rowStart: 3, rowSpan: 8, columns: 2, emphasis: "primary" },
    { zone: "ambient", colStart: 2, colSpan: 4, rowStart: 12, rowSpan: 3, columns: 2, emphasis: "muted" },
    { zone: "edge", colStart: 1, colSpan: 6, rowStart: 17, rowSpan: 2, columns: 4, emphasis: "muted" },
  ],
};
const widgetEntries = new Map();

export function getGridElement() {
  return document.getElementById(GRID_ID);
}

export function getZoneElement(zoneName) {
  if (!zoneName) return null;
  return document.querySelector(`[data-zone="${zoneName}"]`);
}

function getActiveLayoutMode() {
  return document.body?.dataset?.layoutMode || "home";
}

function resolveFallbackOrder(widgetConfig) {
  return widgetConfig.position_row * 100 + widgetConfig.position_col;
}

function resolveLegacyZone(widgetConfig) {
  const slotName = widgetConfig?.config_json?.slot;
  return (
    widgetConfig?.zone ||
    LEGACY_SLOT_MAP[slotName] ||
    DEFAULT_ZONE_MAP[widgetConfig.widget_id] ||
    null
  );
}

export function normalizeWidgetLayout(widgetConfig) {
  const zone = resolveLegacyZone(widgetConfig);
  const limits = ZONE_LIMITS[zone] || ZONE_LIMITS.ambient;
  return {
    zone,
    order:
      typeof widgetConfig?.display_order === "number"
        ? widgetConfig.display_order
        : typeof widgetConfig?.config_json?.priority === "number"
          ? widgetConfig.config_json.priority
          : resolveFallbackOrder(widgetConfig),
    rowSpan: Math.max(
      1,
      Math.min(
        limits.rowSpan,
        Number(widgetConfig?.row_span || widgetConfig?.size_rows || 1)
      )
    ),
    colSpan: Math.max(
      1,
      Math.min(
        limits.colSpan,
        Number(widgetConfig?.col_span || widgetConfig?.size_cols || 1)
      )
    ),
  };
}

function applyZonePlacement(container, widgetConfig) {
  const layout = normalizeWidgetLayout(widgetConfig);
  const zone = getZoneElement(layout.zone);
  container.dataset.priority = String(layout.order);
  container.dataset.zone = layout.zone || "";
  container.style.order = String(layout.order);
  container.style.setProperty("--widget-row-span", String(layout.rowSpan));
  container.style.setProperty("--widget-col-span", String(layout.colSpan));
  container.classList.toggle("widget-tile--legacy", !zone);

  if (zone) {
    container.style.gridRow = "";
    container.style.gridColumn = "";
    zone.appendChild(container);
    return;
  }

  applyLegacyGridPlacement(container, widgetConfig);
}

function applyLegacyGridPlacement(container, widgetConfig) {
  const grid = getGridElement();
  if (!grid) return;
  container.style.gridRow = `${widgetConfig.position_row} / span ${widgetConfig.size_rows}`;
  container.style.gridColumn = `${widgetConfig.position_col} / span ${widgetConfig.size_cols}`;
  grid.appendChild(container);
}

function createZoneElement(config) {
  const section = document.createElement("section");
  section.className = `layout-zone layout-zone--${config.zone}`;
  section.dataset.zone = config.zone;
  section.dataset.emphasis = config.emphasis;
  section.style.gridColumn = `${config.colStart} / span ${config.colSpan}`;
  section.style.gridRow = `${config.rowStart} / span ${config.rowSpan}`;
  section.style.setProperty("--zone-columns", String(config.columns || 1));
  return section;
}

export function renderLayoutMode(mode = getActiveLayoutMode()) {
  const grid = getGridElement();
  if (!grid) {
    throw new Error("Grid container not found");
  }

  const template = LAYOUT_TEMPLATES[mode] || LAYOUT_TEMPLATES.home;
  grid.innerHTML = "";

  template.forEach((zoneConfig) => {
    grid.appendChild(createZoneElement(zoneConfig));
  });

  widgetEntries.forEach(({ container, config }) => {
    applyZonePlacement(container, config);
  });
}

export function createWidgetContainer(widgetConfig) {
  const grid = getGridElement();
  if (!grid) {
    throw new Error("Grid container not found");
  }

  const container = document.createElement("div");
  container.className = `widget-tile widget--${widgetConfig.widget_id}`;
  container.dataset.widgetId = widgetConfig.widget_id;
  widgetEntries.set(container, { container, config: widgetConfig });
  applyZonePlacement(container, widgetConfig);
  return container;
}

