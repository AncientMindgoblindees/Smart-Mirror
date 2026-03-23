/**
 * Drag-and-drop widget placement on the 4×4 CSS grid (layout mode 0 only).
 */

import { setTileGridPlacement } from "../layout.js";

const GRID_ROWS = 4;
const GRID_COLS = 4;
const MIME = "application/x-mirror-widget-id";

/**
 * @param {number} pos
 * @param {number} track
 * @param {number} gap
 * @param {number} n
 */
function axisCellFromPos(pos, track, gap, n) {
  for (let i = 0; i < n; i += 1) {
    const start = i * (track + gap);
    const end = start + track;
    if (pos < end) return i + 1;
    if (i < n - 1 && pos < end + gap) return i + 1;
  }
  return n;
}

/**
 * @param {HTMLElement} gridEl
 * @param {number} clientX
 * @param {number} clientY
 * @returns {{ row: number, col: number } | null}
 */
export function gridCellFromPointer(gridEl, clientX, clientY) {
  const r = gridEl.getBoundingClientRect();
  const cs = getComputedStyle(gridEl);
  const pl = parseFloat(cs.paddingLeft) || 0;
  const pr = parseFloat(cs.paddingRight) || 0;
  const pt = parseFloat(cs.paddingTop) || 0;
  const pb = parseFloat(cs.paddingBottom) || 0;
  const gx = parseFloat(cs.columnGap) || parseFloat(cs.gap) || 0;
  const gy = parseFloat(cs.rowGap) || parseFloat(cs.gap) || 0;
  const innerW = r.width - pl - pr;
  const innerH = r.height - pt - pb;
  let x = clientX - r.left - pl;
  let y = clientY - r.top - pt;
  if (x < 0 || y < 0 || x > innerW || y > innerH) return null;

  const cw = (innerW - (GRID_COLS - 1) * gx) / GRID_COLS;
  const ch = (innerH - (GRID_ROWS - 1) * gy) / GRID_ROWS;
  if (cw <= 0 || ch <= 0) return null;

  const col = axisCellFromPos(x, cw, gx, GRID_COLS);
  const row = axisCellFromPos(y, ch, gy, GRID_ROWS);
  return { row, col };
}

/**
 * @param {{ position_row: number, position_col: number, size_rows: number, size_cols: number }} c
 */
function rectOf(c) {
  return {
    rs: c.position_row,
    cs: c.position_col,
    re: c.position_row + c.size_rows,
    ce: c.position_col + c.size_cols,
  };
}

/**
 * @param {{ rs: number, cs: number, re: number, ce: number }} a
 * @param {{ rs: number, cs: number, re: number, ce: number }} b
 */
function rectsOverlap(a, b) {
  return !(a.re <= b.rs || a.rs >= b.re || a.ce <= b.cs || a.cs >= b.ce);
}

/**
 * @param {string} excludeId
 * @param {Array<{ widget_id: string, config: { position_row: number, position_col: number, size_rows: number, size_cols: number } }>} entries
 * @param {{ rs: number, cs: number, re: number, ce: number }} rect
 */
function overlapsAny(excludeId, entries, rect) {
  return entries.some((e) => {
    if (e.widget_id === excludeId) return false;
    return rectsOverlap(rect, rectOf(e.config));
  });
}

/**
 * @param {() => number} getLayoutMode
 * @param {HTMLElement | null} grid
 */
export function refreshWidgetDragState(getLayoutMode, grid) {
  if (!grid) return;
  const free = getLayoutMode() === 0;
  grid.querySelectorAll(".widget-drag-handle").forEach((h) => {
    if (h instanceof HTMLElement) {
      h.draggable = free;
      h.toggleAttribute("aria-disabled", !free);
      h.classList.toggle("widget-drag-handle--locked", !free);
    }
  });
}

/**
 * @param {object} opts
 * @param {HTMLElement | null} opts.grid
 * @param {() => number} opts.getLayoutMode
 * @param {() => Array<{ widget_id: string, config: object, container: HTMLElement }>} opts.getEntries
 * @param {(configs: object[]) => void} opts.onPersist
 */
export function initWidgetGridDnD(opts) {
  const { grid, getLayoutMode, getEntries, onPersist } = opts;
  if (!grid) return () => {};

  function persistFromEntries(entries) {
    const configs = entries.map((e) => ({ ...e.config }));
    onPersist(configs);
  }

  function applyPlacement(entry, row, col, gridEl) {
    entry.config.position_row = row;
    entry.config.position_col = col;
    setTileGridPlacement(
      entry.container,
      row,
      col,
      entry.config.size_rows,
      entry.config.size_cols,
      gridEl
    );
  }

  /**
   * @param {string} draggedId
   * @param {number} targetRow
   * @param {number} targetCol
   */
  function tryPlace(draggedId, targetRow, targetCol) {
    const entries = getEntries();
    const dragged = entries.find((e) => e.widget_id === draggedId);
    if (!dragged) return;

    const sr = dragged.config.size_rows;
    const sc = dragged.config.size_cols;
    let row = Math.max(1, Math.min(GRID_ROWS - sr + 1, targetRow));
    let col = Math.max(1, Math.min(GRID_COLS - sc + 1, targetCol));

    const proposed = {
      rs: row,
      cs: col,
      re: row + sr,
      ce: col + sc,
    };

    const others = entries.filter((e) => e.widget_id !== draggedId);
    const hit = others.find((o) => rectsOverlap(proposed, rectOf(o.config)));

    if (!hit) {
      applyPlacement(dragged, row, col, grid);
      persistFromEntries(entries);
      return;
    }

    const oldDrag = rectOf(dragged.config);
    const swapRow = oldDrag.rs;
    const swapCol = oldDrag.cs;
    const hitNew = {
      rs: swapRow,
      cs: swapCol,
      re: swapRow + hit.config.size_rows,
      ce: swapCol + hit.config.size_cols,
    };

    if (
      hitNew.re > GRID_ROWS + 1 ||
      hitNew.ce > GRID_COLS + 1 ||
      hitNew.rs < 1 ||
      hitNew.cs < 1
    ) {
      return;
    }

    const draggedAtNew = proposed;
    const rest = others.filter((o) => o.widget_id !== hit.widget_id);

    const hitOverlapsRest = overlapsAny(draggedId, rest, hitNew);
    const dragOverlapsRest = overlapsAny(hit.widget_id, rest, draggedAtNew);

    if (hitOverlapsRest || dragOverlapsRest || rectsOverlap(draggedAtNew, hitNew)) {
      return;
    }

    applyPlacement(dragged, row, col, grid);
    applyPlacement(hit, swapRow, swapCol, grid);
    persistFromEntries(getEntries());
  }

  function onDragStart(e) {
    if (getLayoutMode() !== 0) {
      e.preventDefault();
      return;
    }
    const t = e.target;
    if (!(t instanceof Element)) return;
    const handle = t.closest(".widget-drag-handle");
    if (!handle || !grid.contains(handle)) return;
    const tile = handle.closest(".widget-tile");
    if (!(tile instanceof HTMLElement)) return;
    const id = tile.dataset.widgetId || "";
    e.dataTransfer?.setData(MIME, id);
    e.dataTransfer?.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
    tile.classList.add("widget-tile--dragging");
  }

  function onDragEnd(e) {
    const t = e.target;
    if (t instanceof Element) {
      const tile = t.closest(".widget-tile");
      tile?.classList.remove("widget-tile--dragging");
    }
    grid.classList.remove("mirror-grid--drop-target");
  }

  function onDragOver(e) {
    if (getLayoutMode() !== 0) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    grid.classList.add("mirror-grid--drop-target");
  }

  function onDragLeave(e) {
    if (e.currentTarget === grid && !grid.contains(e.relatedTarget)) {
      grid.classList.remove("mirror-grid--drop-target");
    }
  }

  function onDrop(e) {
    e.preventDefault();
    grid.classList.remove("mirror-grid--drop-target");
    if (getLayoutMode() !== 0) return;

    const id =
      e.dataTransfer?.getData(MIME) ||
      e.dataTransfer?.getData("text/plain") ||
      "";
    if (!id) return;

    const cell = gridCellFromPointer(grid, e.clientX, e.clientY);
    if (!cell) return;

    tryPlace(id, cell.row, cell.col);
  }

  grid.addEventListener("dragstart", onDragStart);
  grid.addEventListener("dragend", onDragEnd);
  grid.addEventListener("dragover", onDragOver);
  grid.addEventListener("dragleave", onDragLeave);
  grid.addEventListener("drop", onDrop);

  refreshWidgetDragState(getLayoutMode, grid);

  return () => {
    grid.removeEventListener("dragstart", onDragStart);
    grid.removeEventListener("dragend", onDragEnd);
    grid.removeEventListener("dragover", onDragOver);
    grid.removeEventListener("dragleave", onDragLeave);
    grid.removeEventListener("drop", onDrop);
  };
}
