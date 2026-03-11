const GRID_ID = "mirror-grid";

export function getGridElement() {
  return document.getElementById(GRID_ID);
}

export function createWidgetContainer(widgetConfig) {
  const grid = getGridElement();
  if (!grid) {
    throw new Error("Grid container not found");
  }

  const container = document.createElement("div");
  container.className = `widget-tile widget--${widgetConfig.widget_id}`;
  container.dataset.widgetId = widgetConfig.widget_id;

  container.style.gridRowStart = String(widgetConfig.position_row);
  container.style.gridRowEnd = String(
    widgetConfig.position_row + widgetConfig.size_rows
  );
  container.style.gridColumnStart = String(widgetConfig.position_col);
  container.style.gridColumnEnd = String(
    widgetConfig.position_col + widgetConfig.size_cols
  );

  grid.appendChild(container);
  return container;
}

