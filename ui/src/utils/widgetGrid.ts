import type { WidgetConfig } from '@/features/widgets/types';
import { inferWidgetSizePreset } from '@/features/widgets/sizePresets';

export type WidgetGridOptions = {
  rows: number;
  cols: number;
  maxAttempts?: number;
  random?: () => number;
};

export type WidgetGridSummary = {
  totalWidgets: number;
  randomPlacements: number;
  fallbackPlacements: number;
  resizedPlacements: number;
  totalAttempts: number;
};

type InternalPlacedWidget = {
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
  mode: 'random' | 'fallback';
  attempts: number;
};

function unmarkOccupied(
  occupied: boolean[][],
  row: number,
  col: number,
  rowSpan: number,
  colSpan: number,
): void {
  for (let r = row; r < row + rowSpan; r += 1) {
    for (let c = col; c < col + colSpan; c += 1) {
      occupied[r][c] = false;
    }
  }
}

function createGrid(rows: number, cols: number): boolean[][] {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => false));
}

function toSpan(value: number, bound: number): number {
  return Math.max(1, Math.min(bound, Math.round(value)));
}

function spanFromWidget(widget: WidgetConfig, rows: number, cols: number): { rowSpan: number; colSpan: number } {
  const inferredRowSpan = toSpan((widget.freeform.height / 100) * rows, rows);
  const inferredColSpan = toSpan((widget.freeform.width / 100) * cols, cols);
  const rowSpan = toSpan(widget.grid.rowSpan || inferredRowSpan, rows);
  const colSpan = toSpan(widget.grid.colSpan || inferredColSpan, cols);
  return { rowSpan: Math.max(rowSpan, inferredRowSpan), colSpan: Math.max(colSpan, inferredColSpan) };
}

function canPlace(
  occupied: boolean[][],
  row: number,
  col: number,
  rowSpan: number,
  colSpan: number,
): boolean {
  const rows = occupied.length;
  const cols = occupied[0]?.length ?? 0;
  if (row < 0 || col < 0) return false;
  if (row + rowSpan > rows || col + colSpan > cols) return false;

  for (let r = row; r < row + rowSpan; r += 1) {
    for (let c = col; c < col + colSpan; c += 1) {
      if (occupied[r]?.[c]) return false;
    }
  }
  return true;
}

function markOccupied(
  occupied: boolean[][],
  row: number,
  col: number,
  rowSpan: number,
  colSpan: number,
): void {
  for (let r = row; r < row + rowSpan; r += 1) {
    for (let c = col; c < col + colSpan; c += 1) {
      occupied[r][c] = true;
    }
  }
}

function firstFit(
  occupied: boolean[][],
  rowSpan: number,
  colSpan: number,
): { row: number; col: number } | null {
  const rows = occupied.length;
  const cols = occupied[0]?.length ?? 0;
  for (let row = 0; row <= rows - rowSpan; row += 1) {
    for (let col = 0; col <= cols - colSpan; col += 1) {
      if (canPlace(occupied, row, col, rowSpan, colSpan)) {
        return { row, col };
      }
    }
  }
  return null;
}

function buildOccupiedFromPlacements(
  rows: number,
  cols: number,
  placements: Map<string, InternalPlacedWidget>,
): boolean[][] {
  const occupied = createGrid(rows, cols);
  for (const placement of placements.values()) {
    markOccupied(occupied, placement.row, placement.col, placement.rowSpan, placement.colSpan);
  }
  return occupied;
}

function expandPlacementsToFill(
  rows: number,
  cols: number,
  placements: Map<string, InternalPlacedWidget>,
): number {
  const occupied = buildOccupiedFromPlacements(rows, cols, placements);
  const ordered = Array.from(placements.entries()).sort(
    (a, b) => b[1].rowSpan * b[1].colSpan - a[1].rowSpan * a[1].colSpan,
  );
  let resizedCount = 0;

  for (const [id, placement] of ordered) {
    const originalRowSpan = placement.rowSpan;
    const originalColSpan = placement.colSpan;
    unmarkOccupied(occupied, placement.row, placement.col, placement.rowSpan, placement.colSpan);

    let grew = true;
    while (grew) {
      grew = false;
      if (
        placement.col + placement.colSpan < cols &&
        canPlace(occupied, placement.row, placement.col, placement.rowSpan, placement.colSpan + 1)
      ) {
        placement.colSpan += 1;
        grew = true;
      }
      if (
        placement.row + placement.rowSpan < rows &&
        canPlace(occupied, placement.row, placement.col, placement.rowSpan + 1, placement.colSpan)
      ) {
        placement.rowSpan += 1;
        grew = true;
      }
    }

    markOccupied(occupied, placement.row, placement.col, placement.rowSpan, placement.colSpan);
    placements.set(id, placement);
    if (placement.rowSpan !== originalRowSpan || placement.colSpan !== originalColSpan) resizedCount += 1;
  }

  return resizedCount;
}

export function randomizeWidgetsOnGrid(
  widgets: WidgetConfig[],
  options: WidgetGridOptions,
): { widgets: WidgetConfig[]; summary: WidgetGridSummary } {
  const rows = Math.max(1, Math.floor(options.rows));
  const cols = Math.max(1, Math.floor(options.cols));
  const maxAttempts = Math.max(1, Math.floor(options.maxAttempts ?? 60));
  const random = options.random ?? Math.random;

  const sorted = widgets
    .map((widget, index) => ({ widget, index, ...spanFromWidget(widget, rows, cols) }))
    .sort((a, b) => b.rowSpan * b.colSpan - a.rowSpan * a.colSpan);

  const placements = new Map<string, InternalPlacedWidget>();
  let totalAttempts = 0;
  const maxLayoutRestarts = 12;

  const tryPlaceAll = (): Map<string, InternalPlacedWidget> | null => {
    const occupied = createGrid(rows, cols);
    const out = new Map<string, InternalPlacedWidget>();
    for (const entry of sorted) {
      const maxRow = rows - entry.rowSpan;
      const maxCol = cols - entry.colSpan;
      let placed = false;

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        totalAttempts += 1;
        const row = Math.floor(random() * (maxRow + 1));
        const col = Math.floor(random() * (maxCol + 1));
        if (!canPlace(occupied, row, col, entry.rowSpan, entry.colSpan)) continue;
        markOccupied(occupied, row, col, entry.rowSpan, entry.colSpan);
        out.set(entry.widget.id, {
          row,
          col,
          rowSpan: entry.rowSpan,
          colSpan: entry.colSpan,
          mode: 'random',
          attempts: attempt,
        });
        placed = true;
        break;
      }

      if (placed) continue;

      const deterministic = firstFit(occupied, entry.rowSpan, entry.colSpan);
      if (!deterministic) return null;
      markOccupied(occupied, deterministic.row, deterministic.col, entry.rowSpan, entry.colSpan);
      out.set(entry.widget.id, {
        row: deterministic.row,
        col: deterministic.col,
        rowSpan: entry.rowSpan,
        colSpan: entry.colSpan,
        mode: 'fallback',
        attempts: maxAttempts,
      });
    }
    return out;
  };

  let found = false;
  for (let restart = 0; restart < maxLayoutRestarts; restart += 1) {
    const attempt = tryPlaceAll();
    if (!attempt) continue;
    placements.clear();
    for (const [id, placement] of attempt.entries()) {
      placements.set(id, placement);
    }
    found = true;
    break;
  }

  if (!found) {
    return {
      widgets,
      summary: {
        totalWidgets: widgets.length,
        randomPlacements: 0,
        fallbackPlacements: 0,
        resizedPlacements: 0,
        totalAttempts,
      },
    };
  }

  const summary: WidgetGridSummary = {
    totalWidgets: widgets.length,
    randomPlacements: 0,
    fallbackPlacements: 0,
    resizedPlacements: 0,
    totalAttempts,
  };

  summary.resizedPlacements = expandPlacementsToFill(rows, cols, placements);

  const randomized = widgets.map((widget) => {
    const placement = placements.get(widget.id);
    if (!placement) return widget;

    if (placement.mode === 'random') summary.randomPlacements += 1;
    if (placement.mode === 'fallback') summary.fallbackPlacements += 1;

    const width = Number(((placement.colSpan / cols) * 100).toFixed(2));
    const height = Number(((placement.rowSpan / rows) * 100).toFixed(2));
    const rawX = Number(((placement.col / cols) * 100).toFixed(2));
    const rawY = Number(((placement.row / rows) * 100).toFixed(2));
    const x = Math.min(Math.max(0, rawX), Math.max(0, 100 - width));
    const y = Math.min(Math.max(0, rawY), Math.max(0, 100 - height));
    const sizePreset = widget.freeform.sizePreset ?? inferWidgetSizePreset(width, height);

    return {
      ...widget,
      grid: {
        ...widget.grid,
        row: placement.row + 1,
        col: placement.col + 1,
        rowSpan: placement.rowSpan,
        colSpan: placement.colSpan,
      },
      freeform: {
        ...widget.freeform,
        x,
        y,
        width,
        height,
        sizePreset,
      },
    };
  });

  return { widgets: randomized, summary };
}
