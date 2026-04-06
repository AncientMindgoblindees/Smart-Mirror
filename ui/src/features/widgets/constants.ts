import type { WidgetConfig } from './types';

export const WIDGET_STORAGE_KEY = 'mirror_dashboard_config';

export const DEV_PANEL_STORAGE_KEY = 'mirror_show_dev_panel';

/** Initial layout: freeform values are percents of canvas (matches config-app defaults). */
export const INITIAL_WIDGETS: WidgetConfig[] = [
  {
    id: 'w1',
    type: 'clock',
    enabled: true,
    grid: { row: 1, col: 1, rowSpan: 1, colSpan: 2 },
    freeform: { x: 10, y: 10, width: 35, height: 15 },
  },
  {
    id: 'w2',
    type: 'weather',
    enabled: true,
    grid: { row: 1, col: 3, rowSpan: 1, colSpan: 1 },
    freeform: { x: 55, y: 10, width: 35, height: 15 },
  },
  {
    id: 'w3',
    type: 'calendar',
    enabled: true,
    grid: { row: 2, col: 1, rowSpan: 2, colSpan: 1 },
    freeform: { x: 10, y: 75, width: 35, height: 15 },
  },
];
