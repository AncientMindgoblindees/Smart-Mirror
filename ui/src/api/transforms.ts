import type { WidgetConfigOut, WidgetConfigUpdate } from './backendTypes';
import type { WidgetConfig } from '@/features/widgets/types';

const DEFAULT_FREEFORM = { x: 50, y: 50, width: 400, height: 200 };

function readFreeform(
  configJson: Record<string, unknown> | null | undefined
): WidgetConfig['freeform'] {
  const raw = configJson?.freeform;
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_FREEFORM };
  const o = raw as Record<string, unknown>;
  return {
    x: typeof o.x === 'number' ? o.x : DEFAULT_FREEFORM.x,
    y: typeof o.y === 'number' ? o.y : DEFAULT_FREEFORM.y,
    width: typeof o.width === 'number' ? o.width : DEFAULT_FREEFORM.width,
    height: typeof o.height === 'number' ? o.height : DEFAULT_FREEFORM.height,
  };
}

export function widgetFromBackend(w: WidgetConfigOut): WidgetConfig {
  return {
    id: `w-${w.id}`,
    backendId: w.id,
    type: w.widget_id,
    enabled: w.enabled,
    grid: {
      row: w.position_row,
      col: w.position_col,
      rowSpan: w.size_rows,
      colSpan: w.size_cols,
    },
    freeform: readFreeform(w.config_json),
  };
}

export function widgetToBackend(w: WidgetConfig): WidgetConfigUpdate {
  return {
    id: w.backendId ?? undefined,
    widget_id: w.type,
    enabled: w.enabled,
    position_row: w.grid.row,
    position_col: w.grid.col,
    size_rows: w.grid.rowSpan,
    size_cols: w.grid.colSpan,
    config_json: {
      freeform: w.freeform,
    },
  };
}
