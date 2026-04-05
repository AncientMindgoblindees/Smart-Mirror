import type { WidgetConfig } from './types';

export const WIDGET_STORAGE_KEY = 'mirror_dashboard_config';

export const DEV_PANEL_STORAGE_KEY = 'mirror_show_dev_panel';

export const INITIAL_WIDGETS: WidgetConfig[] = [
  {
    id: 'w1',
    type: 'clock',
    enabled: true,
    grid: { row: 1, col: 1, rowSpan: 1, colSpan: 2 },
    freeform: { x: 50, y: 50, width: 400, height: 200 },
  },
  {
    id: 'w2',
    type: 'weather',
    enabled: true,
    grid: { row: 1, col: 3, rowSpan: 1, colSpan: 1 },
    freeform: { x: 500, y: 50, width: 250, height: 200 },
  },
  {
    id: 'w3',
    type: 'calendar',
    enabled: true,
    grid: { row: 2, col: 1, rowSpan: 2, colSpan: 1 },
    freeform: { x: 50, y: 300, width: 300, height: 400 },
  },
];
