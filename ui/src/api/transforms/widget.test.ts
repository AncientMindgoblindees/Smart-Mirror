import { describe, expect, it } from 'vitest';
import { widgetToBackend } from '@/api/transforms';
import type { WidgetConfig } from '@/features/widgets/types';

function makeWidget(overrides: Partial<WidgetConfig> = {}): WidgetConfig {
  return {
    id: 'w-test',
    type: 'weather',
    enabled: true,
    grid: { row: 2, col: 3, rowSpan: 1, colSpan: 2 },
    freeform: { x: 10, y: 10, width: 30, height: 20, sizePreset: 'medium' },
    ...overrides,
  };
}

describe('widgetToBackend', () => {
  it('sanitizes invalid grid values to avoid backend 422 payloads', () => {
    const bad = makeWidget({
      grid: {
        row: Number.NaN,
        col: Number.NaN,
        rowSpan: Number.NaN,
        colSpan: Number.NaN,
      },
    });

    const out = widgetToBackend(bad);
    expect(out.position_row).toBe(1);
    expect(out.position_col).toBe(1);
    expect(out.size_rows).toBe(1);
    expect(out.size_cols).toBe(1);
  });

  it('sanitizes non-finite freeform values', () => {
    const bad = makeWidget({
      freeform: {
        x: Number.NaN,
        y: Number.POSITIVE_INFINITY,
        width: Number.NaN,
        height: Number.NaN,
      } as WidgetConfig['freeform'],
    });

    const out = widgetToBackend(bad);
    const freeform = (out.config_json?.freeform ?? {}) as Record<string, unknown>;
    expect(freeform.width).toBeGreaterThan(0);
    expect(freeform.height).toBeGreaterThan(0);
    expect(freeform.x).toBeGreaterThanOrEqual(0);
    expect(freeform.y).toBeGreaterThanOrEqual(0);
  });
});
