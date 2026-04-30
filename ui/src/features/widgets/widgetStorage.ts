import { normalizeWidgetConfig, widgetToBackend } from '@/api/transforms';
import type { WidgetConfig } from './types';
import { WIDGET_STORAGE_KEY } from './constants';

export function loadWidgetCache(): WidgetConfig[] | null {
  const raw = localStorage.getItem(WIDGET_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { widgets?: WidgetConfig[] };
    if (!Array.isArray(parsed.widgets) || parsed.widgets.length === 0) return null;
    return parsed.widgets.map((w) => normalizeWidgetConfig(w as WidgetConfig));
  } catch {
    return null;
  }
}

export function saveWidgetCache(widgets: WidgetConfig[]): void {
  localStorage.setItem(WIDGET_STORAGE_KEY, JSON.stringify({ widgets }));
}

export function signatureFromWidgets(widgets: WidgetConfig[]): string {
  return JSON.stringify(widgets.map(widgetToBackend));
}
