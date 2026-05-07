import { describe, expect, it } from 'vitest';
import type { WidgetConfig } from '@/features/widgets/types';
import { randomizeWidgetsOnGrid } from './widgetGrid';

function makeWidget(id: string, width = 32, height = 20): WidgetConfig {
  return {
    id,
    type: 'clock',
    enabled: true,
    grid: { row: 0, col: 0, rowSpan: 2, colSpan: 2 },
    freeform: { x: 0, y: 0, width, height, sizePreset: 'medium' },
  };
}

function collectOccupied(widgets: WidgetConfig[], rows: number, cols: number): Set<string> {
  const cells = new Set<string>();
  for (const widget of widgets) {
    const startRow = Math.max(0, widget.grid.row - 1);
    const startCol = Math.max(0, widget.grid.col - 1);
    const maxRow = Math.min(rows, startRow + widget.grid.rowSpan);
    const maxCol = Math.min(cols, startCol + widget.grid.colSpan);
    for (let row = startRow; row < maxRow; row += 1) {
      for (let col = startCol; col < maxCol; col += 1) {
        cells.add(`${row}:${col}`);
      }
    }
  }
  return cells;
}

describe('randomizeWidgetsOnGrid', () => {
  it('keeps widgets inside bounds and without overlap', () => {
    const widgets = [makeWidget('w1'), makeWidget('w2'), makeWidget('w3')];
    const out = randomizeWidgetsOnGrid(widgets, { rows: 6, cols: 6, random: () => 0.35 });

    for (const widget of out.widgets) {
      expect(widget.grid.row).toBeGreaterThanOrEqual(1);
      expect(widget.grid.col).toBeGreaterThanOrEqual(1);
      expect(widget.grid.row - 1 + widget.grid.rowSpan).toBeLessThanOrEqual(6);
      expect(widget.grid.col - 1 + widget.grid.colSpan).toBeLessThanOrEqual(6);
    }

    const occupied = collectOccupied(out.widgets, 6, 6);
    const expectedCellCount = out.widgets.reduce(
      (sum, widget) => sum + widget.grid.rowSpan * widget.grid.colSpan,
      0,
    );
    expect(occupied.size).toBe(expectedCellCount);
  });

  it('falls back to deterministic open slot when random attempts collide', () => {
    const widgets = [makeWidget('w1', 50, 50), makeWidget('w2', 50, 50)];
    const out = randomizeWidgetsOnGrid(widgets, { rows: 4, cols: 4, maxAttempts: 2, random: () => 0 });
    expect(out.summary.fallbackPlacements + out.summary.resizedPlacements).toBeGreaterThan(0);
    const occupied = collectOccupied(out.widgets, 4, 4);
    const expectedCellCount = out.widgets.reduce(
      (sum, widget) => sum + widget.grid.rowSpan * widget.grid.colSpan,
      0,
    );
    expect(occupied.size).toBe(expectedCellCount);
  });

  it('expands widget freeform dimensions to fill available space without overlap', () => {
    const widgets = [makeWidget('w1', 44, 28), makeWidget('w2', 32, 20)];
    const before = widgets.map((w) => ({ id: w.id, width: w.freeform.width, height: w.freeform.height }));
    const out = randomizeWidgetsOnGrid(widgets, { rows: 12, cols: 12 });
    expect(out.summary.resizedPlacements).toBeGreaterThanOrEqual(0);
    let grewAtLeastOne = false;
    for (const entry of before) {
      const widget = out.widgets.find((w) => w.id === entry.id);
      expect(widget).toBeTruthy();
      expect(widget!.freeform.width).toBeGreaterThanOrEqual(entry.width);
      expect(widget!.freeform.height).toBeGreaterThanOrEqual(entry.height);
      if (widget!.freeform.width > entry.width || widget!.freeform.height > entry.height) {
        grewAtLeastOne = true;
      }
    }
    expect(grewAtLeastOne).toBe(true);
  });
});
