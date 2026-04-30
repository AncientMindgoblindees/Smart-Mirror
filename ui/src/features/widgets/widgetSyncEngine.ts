import type { WidgetConfigOut } from '@/api/backendTypes';
import { dedupeWidgetRows, widgetFromBackend, widgetToBackend } from '@/api/transforms';
import type { WidgetConfig } from './types';

export function serverLayoutFingerprint(rows: WidgetConfigOut[]): string {
  return JSON.stringify(
    rows
      .map((r) => ({
        id: r.id,
        widget_id: r.widget_id,
        enabled: r.enabled,
        position_row: r.position_row,
        position_col: r.position_col,
        size_rows: r.size_rows,
        size_cols: r.size_cols,
        config_json: r.config_json,
        updated_at: r.updated_at,
      }))
      .sort((a, b) => a.id - b.id),
  );
}

export function mergeRowsToWidgets(rows: WidgetConfigOut[]): WidgetConfig[] {
  return dedupeWidgetRows(rows).map(widgetFromBackend);
}

export function widgetsSignature(widgets: WidgetConfig[]): string {
  return JSON.stringify(widgets.map(widgetToBackend));
}
