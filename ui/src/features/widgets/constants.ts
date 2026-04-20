import type { WidgetConfig } from './types';
import { WIDGET_SIZE_PRESETS } from './sizePresets';

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
    freeform: { x: 3, y: 4, ...WIDGET_SIZE_PRESETS.medium, sizePreset: 'medium' },
  },
  {
    id: 'w2',
    type: 'weather',
    enabled: true,
    grid: { row: 1, col: 3, rowSpan: 1, colSpan: 1 },
    freeform: { x: 67, y: 4, ...WIDGET_SIZE_PRESETS.medium, sizePreset: 'medium' },
  },
  {
    id: 'w3',
    type: 'news',
    enabled: true,
    grid: { row: 3, col: 1, rowSpan: 2, colSpan: 2 },
    freeform: { x: 3, y: 70, ...WIDGET_SIZE_PRESETS.large, sizePreset: 'large' },
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
    freeform: { x: 56, y: 68, ...WIDGET_SIZE_PRESETS.large, sizePreset: 'large' },
  },
  {
    id: 'w6',
    type: 'email',
    enabled: true,
    grid: { row: 2, col: 3, rowSpan: 1, colSpan: 1 },
    freeform: { x: 56, y: 42, ...WIDGET_SIZE_PRESETS.medium, sizePreset: 'medium' },
  },
  {
    id: 'w5',
    type: 'virtual_try_on',
    enabled: true,
    grid: { row: 2, col: 2, rowSpan: 2, colSpan: 1 },
    freeform: { x: 39, y: 41, ...WIDGET_SIZE_PRESETS.small, sizePreset: 'small' },
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
    clock: { x: 3, y: 4, ...WIDGET_SIZE_PRESETS.medium, sizePreset: 'medium' },
    weather: { x: 67, y: 4, ...WIDGET_SIZE_PRESETS.medium, sizePreset: 'medium' },
    news: { x: 3, y: 70, ...WIDGET_SIZE_PRESETS.large, sizePreset: 'large' },
    calendar: { x: 56, y: 68, ...WIDGET_SIZE_PRESETS.large, sizePreset: 'large' },
    email: { x: 56, y: 42, ...WIDGET_SIZE_PRESETS.medium, sizePreset: 'medium' },
    virtual_try_on: { x: 39, y: 41, ...WIDGET_SIZE_PRESETS.small, sizePreset: 'small' },
  },
  {
    clock: { x: 4, y: 4, ...WIDGET_SIZE_PRESETS.large, sizePreset: 'large' },
    weather: { x: 52, y: 4, ...WIDGET_SIZE_PRESETS.large, sizePreset: 'large' },
    news: { x: 4, y: 66, ...WIDGET_SIZE_PRESETS.medium, sizePreset: 'medium' },
    calendar: { x: 52, y: 66, ...WIDGET_SIZE_PRESETS.medium, sizePreset: 'medium' },
    email: { x: 52, y: 42, ...WIDGET_SIZE_PRESETS.medium, sizePreset: 'medium' },
    virtual_try_on: { x: 39, y: 38, ...WIDGET_SIZE_PRESETS.small, sizePreset: 'small' },
  },
  {
    clock: { x: 4, y: 4, ...WIDGET_SIZE_PRESETS.small, sizePreset: 'small' },
    weather: { x: 74, y: 4, ...WIDGET_SIZE_PRESETS.small, sizePreset: 'small' },
    news: { x: 4, y: 74, ...WIDGET_SIZE_PRESETS.medium, sizePreset: 'medium' },
    calendar: { x: 64, y: 74, ...WIDGET_SIZE_PRESETS.medium, sizePreset: 'medium' },
    email: { x: 64, y: 46, ...WIDGET_SIZE_PRESETS.small, sizePreset: 'small' },
    virtual_try_on: { x: 28, y: 34, ...WIDGET_SIZE_PRESETS.large, sizePreset: 'large' },
  },
];
