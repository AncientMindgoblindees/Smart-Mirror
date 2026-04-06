export type { WidgetConfig, WidgetMetadata } from './types';
export { WidgetFrame } from './WidgetFrame';
export { getWidgetMetadata, WIDGET_REGISTRY, UnknownWidget } from './registry';
export {
  WIDGET_STORAGE_KEY,
  DEV_PANEL_STORAGE_KEY,
  LAYOUT_MODE_STORAGE_KEY,
  INITIAL_WIDGETS,
  LAYOUT_PRESETS,
} from './constants';
export { useWidgetPersistence } from './useWidgetPersistence';
