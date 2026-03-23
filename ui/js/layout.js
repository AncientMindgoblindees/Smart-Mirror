const GRID_ID = "mirror-grid";
export const MIRROR_LAYOUT_MODES = 4;

export function getGridElement() {
  return document.getElementById(GRID_ID);
}

function applyGridFromDataset(el) {
  const {
    baseRowStart,
    baseRowEnd,
    baseColStart,
    baseColEnd,
  } = el.dataset;
  if (!baseRowStart) return;
  el.style.gridRowStart = baseRowStart;
  el.style.gridRowEnd = baseRowEnd;
  el.style.gridColumnStart = baseColStart;
  el.style.gridColumnEnd = baseColEnd;
}

/**
 * @param {HTMLElement} container
 * @param {number} position_row
 * @param {number} position_col
 * @param {number} size_rows
 * @param {number} size_cols
 * @param {HTMLElement | null} gridEl
 */
export function setTileGridPlacement(
  container,
  position_row,
  position_col,
  size_rows,
  size_cols,
  gridEl
) {
  const rowEnd = position_row + size_rows;
  const colEnd = position_col + size_cols;
  container.dataset.baseRowStart = String(position_row);
  container.dataset.baseRowEnd = String(rowEnd);
  container.dataset.baseColStart = String(position_col);
  container.dataset.baseColEnd = String(colEnd);
  if (gridEl && gridEl.dataset.layout === "0") {
    applyGridFromDataset(container);
  }
}

function clearWidgetGridPlacement(el) {
  el.style.gridRowStart = "";
  el.style.gridRowEnd = "";
  el.style.gridColumnStart = "";
  el.style.gridColumnEnd = "";
}

/**
 * @param {HTMLElement} gridEl
 * @param {number} modeIndex
 * @param {HTMLElement[]} tiles
 */
export function setMirrorLayoutMode(gridEl, modeIndex, tiles) {
  const m =
    ((modeIndex % MIRROR_LAYOUT_MODES) + MIRROR_LAYOUT_MODES) %
    MIRROR_LAYOUT_MODES;
  gridEl.dataset.layout = String(m);
  if (m === 0) {
    tiles.forEach((t) => applyGridFromDataset(t));
  } else {
    tiles.forEach((t) => clearWidgetGridPlacement(t));
  }
}

export function createWidgetContainer(widgetConfig) {
  const grid = getGridElement();
  if (!grid) {
    throw new Error("Grid container not found");
  }

  const container = document.createElement("article");
  container.className = `widget-tile widget--${widgetConfig.widget_id}`;
  container.dataset.widgetId = widgetConfig.widget_id;

  const rowStart = widgetConfig.position_row;
  const rowEnd = widgetConfig.position_row + widgetConfig.size_rows;
  const colStart = widgetConfig.position_col;
  const colEnd = widgetConfig.position_col + widgetConfig.size_cols;

  container.dataset.baseRowStart = String(rowStart);
  container.dataset.baseRowEnd = String(rowEnd);
  container.dataset.baseColStart = String(colStart);
  container.dataset.baseColEnd = String(colEnd);

  applyGridFromDataset(container);

  const handle = document.createElement("button");
  handle.type = "button";
  handle.className = "widget-drag-handle";
  handle.draggable = true;
  handle.setAttribute("aria-label", "Drag to reposition widget on the grid");
  handle.title = "Drag to move (layout mode 0 only)";

  const inner = document.createElement("div");
  inner.className = "widget-surface";
  container.appendChild(handle);
  container.appendChild(inner);

  grid.appendChild(container);
  return { container, surface: inner };
}
