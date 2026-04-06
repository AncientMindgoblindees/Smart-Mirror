import type { WidgetConfig } from './types';

export const WIDGET_STORAGE_KEY = 'mirror_dashboard_config';
export const DEV_PANEL_STORAGE_KEY = 'mirror_show_dev_panel';
export const LAYOUT_MODE_STORAGE_KEY = 'mirror_layout_mode_index';

/** Default peripheral mirror composition; freeform values are percents of canvas. */
export const INITIAL_WIDGETS: WidgetConfig[] = [
  {
    id: 'w1',
    type: 'clock',
    enabled: true,
    grid: { row: 1, col: 1, rowSpan: 1, colSpan: 2 },
    freeform: { x: 3, y: 4, width: 32, height: 18 },
  },
  {
    id: 'w2',
    type: 'weather',
    enabled: true,
    grid: { row: 1, col: 3, rowSpan: 1, colSpan: 1 },
    freeform: { x: 67, y: 4, width: 30, height: 18 },
  },
  {
    id: 'w3',
    type: 'news',
    enabled: true,
    grid: { row: 3, col: 1, rowSpan: 2, colSpan: 2 },
    freeform: { x: 3, y: 70, width: 45, height: 24 },
    integration: {
      feature: 'news',
      provider: 'gemini',
      model: 'gemini-3-flash',
      endpoint: '/api/integrations/news',
    },
  },
  {
    id: 'w4',
    type: 'calendar',
    enabled: true,
    grid: { row: 3, col: 3, rowSpan: 2, colSpan: 2 },
    freeform: { x: 56, y: 68, width: 41, height: 26 },
  },
  {
    id: 'w5',
    type: 'virtual_try_on',
    enabled: true,
    grid: { row: 2, col: 2, rowSpan: 2, colSpan: 1 },
    freeform: { x: 39, y: 41, width: 22, height: 16 },
    integration: {
      feature: 'virtual_try_on',
      endpoint: '/api/integrations/try-on',
    },
  },
];

export type LayoutPreset = Record<string, WidgetConfig['freeform']>;

/** Presets for keyboard/button layout cycling (1 key, gpio LAYOUT click). */
export const LAYOUT_PRESETS: LayoutPreset[] = [
  {
    clock: { x: 3, y: 4, width: 32, height: 18 },
    weather: { x: 67, y: 4, width: 30, height: 18 },
    news: { x: 3, y: 70, width: 45, height: 24 },
    calendar: { x: 56, y: 68, width: 41, height: 26 },
    virtual_try_on: { x: 39, y: 41, width: 22, height: 16 },
  },
  {
    clock: { x: 4, y: 4, width: 42, height: 18 },
    weather: { x: 58, y: 4, width: 38, height: 18 },
    news: { x: 4, y: 66, width: 42, height: 28 },
    calendar: { x: 54, y: 66, width: 42, height: 28 },
    virtual_try_on: { x: 39, y: 40, width: 22, height: 18 },
  },
  {
    clock: { x: 4, y: 4, width: 34, height: 17 },
    weather: { x: 62, y: 4, width: 34, height: 17 },
    news: { x: 4, y: 74, width: 36, height: 22 },
    calendar: { x: 60, y: 74, width: 36, height: 22 },
    virtual_try_on: { x: 31, y: 36, width: 38, height: 26 },
  },
];
