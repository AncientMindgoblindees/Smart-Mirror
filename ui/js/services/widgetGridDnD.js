/**
 * Freeform widget placement and resizing (layout mode 0 only).
 * Keeps persistence payload compatible with future external layout services.
 */

const BASE_WIDGET_AREA = 320 * 240;

/**
 * @param {number} n
 * @param {number} fallback
 */
function toFinite(n, fallback) {
  const v = Number(n);
  return Number.isFinite(v) ? v : fallback;
}

/**
 * @param {number} width
 * @param {number} height
 */
function widgetScaleForSize(width, height) {
  const areaRatio = Math.sqrt((width * height) / BASE_WIDGET_AREA);
  return Math.max(0.82, Math.min(2.1, areaRatio));
}

/**
 * @param {HTMLElement} tile
 * @param {{ x: number, y: number, width: number, height: number }} rect
 */
function applyTileFreeformRect(tile, rect) {
  tile.dataset.freeformX = String(rect.x);
  tile.dataset.freeformY = String(rect.y);
  tile.dataset.freeformWidth = String(rect.width);
  tile.dataset.freeformHeight = String(rect.height);
  tile.style.left = `${rect.x}px`;
  tile.style.top = `${rect.y}px`;
  tile.style.width = `${rect.width}px`;
  tile.style.height = `${rect.height}px`;
  tile.style.setProperty(
    "--widget-scale",
    String(widgetScaleForSize(rect.width, rect.height))
  );
}

/**
 * @param {HTMLElement} grid
 * @param {{ container: HTMLElement, config: object }} entry
 * @returns {{ x: number, y: number, width: number, height: number }}
 */
export function ensureFreeformRect(grid, entry) {
  const tile = entry.container;
  const cfg = entry.config || {};
  const gx = toFinite(cfg.freeform_x, Number.NaN);
  const gy = toFinite(cfg.freeform_y, Number.NaN);
  const gw = toFinite(cfg.freeform_width, Number.NaN);
  const gh = toFinite(cfg.freeform_height, Number.NaN);

  if ([gx, gy, gw, gh].every((v) => Number.isFinite(v))) {
    const rect = {
      x: gx,
      y: gy,
      width: Math.max(1, gw),
      height: Math.max(1, gh),
    };
    applyTileFreeformRect(tile, rect);
    return rect;
  }

  const gridRect = grid.getBoundingClientRect();
  const tileRect = tile.getBoundingClientRect();
  const rect = {
    x: tileRect.left - gridRect.left,
    y: tileRect.top - gridRect.top,
    width: Math.max(1, tileRect.width),
    height: Math.max(1, tileRect.height),
  };
  cfg.freeform_x = rect.x;
  cfg.freeform_y = rect.y;
  cfg.freeform_width = rect.width;
  cfg.freeform_height = rect.height;
  applyTileFreeformRect(tile, rect);
  return rect;
}

/**
 * @param {() => number} getLayoutMode
 * @param {HTMLElement | null} grid
 */
/**
 * @param {HTMLElement} grid
 * @param {{ x: number, y: number, width: number, height: number }} rect
 */
function clampFreeformRect(grid, rect) {
  const maxW = grid.clientWidth;
  const maxH = grid.clientHeight;
  const width = Math.min(Math.max(1, rect.width), maxW);
  const height = Math.min(Math.max(1, rect.height), maxH);
  const x = Math.min(Math.max(0, rect.x), Math.max(0, maxW - width));
  const y = Math.min(Math.max(0, rect.y), Math.max(0, maxH - height));
  return { x, y, width, height };
}

export function refreshWidgetDragState(getLayoutMode, grid) {
  if (!grid) return;
  const free = getLayoutMode() === 0;
  grid.classList.toggle("mirror-grid--freeform", free);
  grid.querySelectorAll(".widget-drag-handle, .widget-resize-handle").forEach((h) => {
    if (h instanceof HTMLElement) {
      h.removeAttribute("aria-disabled");
      h.classList.remove("widget-drag-handle--locked", "widget-resize-handle--locked");
    }
  });
}

/**
 * @param {object} opts
 * @param {HTMLElement | null} opts.grid
 * @param {() => number} opts.getLayoutMode
 * @param {() => Array<{ widget_id: string, config: object, container: HTMLElement }>} opts.getEntries
 * @param {(configs: object[]) => void} opts.onPersist
 * @param {(entry: { widget_id: string, config: object }, phase: "move" | "resize" | "final") => void} [opts.onTransform]
 * @param {() => void} [opts.onRequestFreeformLayout] — called when user drags while not in freeform; must switch grid to layout 0 before return
 */
export function initWidgetGridDnD(opts) {
  const { grid, getLayoutMode, getEntries, onPersist, onTransform, onRequestFreeformLayout } =
    opts;
  if (!grid) return () => {};

  /** @type {null | { tile: HTMLElement, entry: { widget_id: string, config: object, container: HTMLElement }, mode: "move" | "resize", pointerId: number, startX: number, startY: number, origin: { x: number, y: number, width: number, height: number } }} */
  let active = null;

  function persistFromEntries() {
    const entries = getEntries();
    const configs = entries.map((e) => ({ ...e.config }));
    onPersist(configs);
  }

  function syncFreeformFromEntries() {
    if (getLayoutMode() !== 0) return;
    const entries = getEntries();
    entries.forEach((entry) => {
      const rect = ensureFreeformRect(grid, entry);
      entry.config.freeform_x = rect.x;
      entry.config.freeform_y = rect.y;
      entry.config.freeform_width = rect.width;
      entry.config.freeform_height = rect.height;
    });
  }

  function onPointerDown(e) {
    if (!(e.target instanceof Element)) return;

    const moveHandle = e.target.closest(".widget-drag-handle");
    const resizeHandle = e.target.closest(".widget-resize-handle");
    if (!moveHandle && !resizeHandle) return;

    const tile = e.target.closest(".widget-tile");
    if (!(tile instanceof HTMLElement) || !grid.contains(tile)) return;

    if (getLayoutMode() !== 0) {
      onRequestFreeformLayout?.();
    }
    if (getLayoutMode() !== 0) return;

    const id = tile.dataset.widgetId;
    const entry = getEntries().find((x) => x.widget_id === id);
    if (!entry) return;

    const rect = ensureFreeformRect(grid, entry);
    const mode = resizeHandle ? "resize" : "move";
    active = {
      tile,
      entry,
      mode,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origin: rect,
    };

    tile.classList.add("widget-tile--dragging");
    tile.style.zIndex = "7";
    tile.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function onPointerMove(e) {
    if (!active || e.pointerId !== active.pointerId) return;
    if (getLayoutMode() !== 0) return;

    const dx = e.clientX - active.startX;
    const dy = e.clientY - active.startY;

    if (active.mode === "move") {
      const rect = clampFreeformRect(grid, {
        x: active.origin.x + dx,
        y: active.origin.y + dy,
        width: active.origin.width,
        height: active.origin.height,
      });
      applyTileFreeformRect(active.tile, rect);
      active.entry.config.freeform_x = rect.x;
      active.entry.config.freeform_y = rect.y;
      onTransform?.(active.entry, "move");
      return;
    }

    const rect = clampFreeformRect(grid, {
      x: active.origin.x,
      y: active.origin.y,
      width: Math.max(1, active.origin.width + dx),
      height: Math.max(1, active.origin.height + dy),
    });
    applyTileFreeformRect(active.tile, rect);
    active.entry.config.freeform_width = rect.width;
    active.entry.config.freeform_height = rect.height;
    onTransform?.(active.entry, "resize");
  }

  function stopPointerTracking(e) {
    if (!active || e.pointerId !== active.pointerId) return;
    active.tile.classList.remove("widget-tile--dragging");
    active.tile.style.zIndex = "";
    try {
      active.tile.releasePointerCapture(active.pointerId);
    } catch {
      // Ignore if pointer capture was already released.
    }
    onTransform?.(active.entry, "final");
    active = null;
    persistFromEntries();
  }

  function onLayoutMaybeChanged() {
    refreshWidgetDragState(getLayoutMode, grid);
    if (getLayoutMode() !== 0) return;
    syncFreeformFromEntries();
  }

  grid.addEventListener("pointerdown", onPointerDown);
  grid.addEventListener("pointermove", onPointerMove);
  grid.addEventListener("pointerup", stopPointerTracking);
  grid.addEventListener("pointercancel", stopPointerTracking);
  window.addEventListener("resize", onLayoutMaybeChanged);

  refreshWidgetDragState(getLayoutMode, grid);
  syncFreeformFromEntries();

  return () => {
    grid.removeEventListener("pointerdown", onPointerDown);
    grid.removeEventListener("pointermove", onPointerMove);
    grid.removeEventListener("pointerup", stopPointerTracking);
    grid.removeEventListener("pointercancel", stopPointerTracking);
    window.removeEventListener("resize", onLayoutMaybeChanged);
  };
}
