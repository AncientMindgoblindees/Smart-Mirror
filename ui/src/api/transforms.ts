import type { WidgetConfigOut, WidgetConfigUpdate } from './backendTypes';
import type { WidgetConfig } from '@/features/widgets/types';
import {
  inferWidgetSizePreset,
  type WidgetSizePreset,
} from '@/features/widgets/sizePresets';

const DEFAULTS_BY_TYPE: Record<string, WidgetConfig['freeform']> = {
  clock: { x: 3, y: 4, width: 32, height: 20, sizePreset: 'medium' },
  weather: { x: 67, y: 4, width: 32, height: 20, sizePreset: 'medium' },
  news: { x: 3, y: 70, width: 44, height: 28, sizePreset: 'large' },
  calendar: { x: 56, y: 68, width: 44, height: 28, sizePreset: 'large' },
  virtual_try_on: { x: 39, y: 41, width: 22, height: 14, sizePreset: 'small' },
};

/** Legacy layouts stored pixel coords against this reference before percent migration. */
const LEGACY_REF = { width: 1280, height: 720 };

function baseType(type: string): string {
  const raw = (type || '').trim().toLowerCase();
  const idx = raw.indexOf(':');
  return idx > 0 ? raw.slice(0, idx) : raw;
}

function defaultFreeformForType(type: string): WidgetConfig['freeform'] {
  const key = baseType(type);
  const fallback = DEFAULTS_BY_TYPE[key] ?? { x: 8, y: 8, width: 32, height: 20 };
  return { ...fallback };
}

function looksLikeLegacyPixel(f: { x: number; y: number; width: number; height: number }): boolean {
  return f.x > 100 || f.y > 100 || f.width > 100 || f.height > 100;
}

function clampFreeform(f: WidgetConfig['freeform']): WidgetConfig['freeform'] {
  const width = Math.min(100, Math.max(0.5, f.width));
  const height = Math.min(100, Math.max(0.5, f.height));
  const x = Math.min(Math.max(0, f.x), 100 - width);
  const y = Math.min(Math.max(0, f.y), 100 - height);
  const sizePreset =
    f.sizePreset ?? inferWidgetSizePreset(width, height);
  return { x, y, width, height, sizePreset };
}

function legacyPixelsToPercent(f: WidgetConfig['freeform']): WidgetConfig['freeform'] {
  return clampFreeform({
    x: (f.x / LEGACY_REF.width) * 100,
    y: (f.y / LEGACY_REF.height) * 100,
    width: (f.width / LEGACY_REF.width) * 100,
    height: (f.height / LEGACY_REF.height) * 100,
  });
}

/** Normalize freeform from storage/API: percent 0–100 of canvas, or migrate old pixel values. */
export function normalizeFreeform(
  raw: Record<string, unknown> | undefined | null,
  fallback: WidgetConfig['freeform']
): WidgetConfig['freeform'] {
  if (!raw || typeof raw !== 'object') return { ...fallback };
  const o = raw as Record<string, unknown>;
  const num = (k: string, d: number) =>
    typeof o[k] === 'number' && Number.isFinite(o[k] as number) ? (o[k] as number) : d;
  const f = {
    x: num('x', fallback.x),
    y: num('y', fallback.y),
    width: num('width', fallback.width),
    height: num('height', fallback.height),
    sizePreset:
      raw && typeof raw.sizePreset === 'string'
        ? (raw.sizePreset as WidgetSizePreset)
        : undefined,
  };
  if (looksLikeLegacyPixel(f)) return legacyPixelsToPercent(f);
  return clampFreeform(f);
}

export function normalizeWidgetConfig(w: WidgetConfig): WidgetConfig {
  const fallback = defaultFreeformForType(w.type);
  return {
    ...w,
    freeform: normalizeFreeform(w.freeform as unknown as Record<string, unknown>, fallback),
  };
}

function readFreeform(configJson: Record<string, unknown> | null | undefined, type: string): WidgetConfig['freeform'] {
  const raw = configJson?.freeform;
  const fallback = defaultFreeformForType(type);
  if (!raw || typeof raw !== 'object') return fallback;
  return normalizeFreeform(raw as Record<string, unknown>, fallback);
}

/** Lowercase; strip trailing `:digits` except for `custom:*` (unique custom instances). */
export function normalizeWidgetTypeId(widgetId: string): string {
  const s = widgetId.trim();
  const colon = s.indexOf(':');
  if (colon > 0) {
    const base = s.slice(0, colon).toLowerCase();
    const rest = s.slice(colon + 1);
    if (/^\d+$/.test(rest) && base !== 'custom') {
      return base;
    }
    return `${base}:${rest}`;
  }
  return s.toLowerCase();
}

export function dedupeWidgetRows(rows: WidgetConfigOut[]): WidgetConfigOut[] {
  const m = new Map<string, WidgetConfigOut>();
  for (const r of rows) {
    const k = normalizeWidgetTypeId(r.widget_id);
    const ex = m.get(k);
    if (!ex || r.id < ex.id) m.set(k, r);
  }
  return [...m.values()].sort((a, b) => a.id - b.id);
}

export function widgetFromBackend(w: WidgetConfigOut): WidgetConfig {
  const cj = w.config_json ?? {};
  const title = typeof cj.title === 'string' ? cj.title : undefined;
  const text = typeof cj.text === 'string' ? cj.text : undefined;
  const templateId = typeof cj.templateId === 'string' ? cj.templateId : undefined;
  const integration =
    cj.integration && typeof cj.integration === 'object'
      ? (cj.integration as WidgetConfig['integration'])
      : undefined;
  const location = typeof cj.location === 'string' ? cj.location : undefined;
  const unit =
    cj.unit === 'imperial' || cj.unit === 'metric' ? (cj.unit as 'metric' | 'imperial') : undefined;
  const format = cj.format === '12h' || cj.format === '24h' ? (cj.format as '12h' | '24h') : undefined;
  const timeFormat =
    cj.timeFormat === '12h' || cj.timeFormat === '24h' ? (cj.timeFormat as '12h' | '24h') : undefined;
  const normalizedType = normalizeWidgetTypeId(w.widget_id);
  return {
    id: `w-${w.id}`,
    backendId: w.id,
    type: normalizedType,
    enabled: w.enabled,
    grid: {
      row: w.position_row,
      col: w.position_col,
      rowSpan: w.size_rows,
      colSpan: w.size_cols,
    },
    freeform: readFreeform(w.config_json, normalizedType),
    ...(title !== undefined ? { title } : {}),
    ...(text !== undefined ? { text } : {}),
    ...(templateId !== undefined ? { templateId } : {}),
    ...(integration !== undefined ? { integration } : {}),
    ...(location !== undefined ? { location } : {}),
    ...(unit !== undefined ? { unit } : {}),
    ...(format !== undefined ? { format } : {}),
    ...(timeFormat !== undefined ? { timeFormat } : {}),
  };
}

export function widgetToBackend(w: WidgetConfig): WidgetConfigUpdate {
  const clamped = clampFreeform(w.freeform);
  const config_json: Record<string, unknown> = {
    freeform: clamped,
  };
  if (w.title !== undefined) config_json.title = w.title;
  if (w.text !== undefined) config_json.text = w.text;
  if (w.templateId !== undefined) config_json.templateId = w.templateId;
  if (w.integration !== undefined) config_json.integration = w.integration;
  if (w.location !== undefined) config_json.location = w.location;
  if (w.unit !== undefined) config_json.unit = w.unit;
  if (w.format !== undefined) config_json.format = w.format;
  if (w.timeFormat !== undefined) config_json.timeFormat = w.timeFormat;
  return {
    id: w.backendId ?? undefined,
    widget_id: normalizeWidgetTypeId(w.type),
    enabled: w.enabled,
    position_row: w.grid.row,
    position_col: w.grid.col,
    size_rows: w.grid.rowSpan,
    size_cols: w.grid.colSpan,
    config_json,
  };
}
