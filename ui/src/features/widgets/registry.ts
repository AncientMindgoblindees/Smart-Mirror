import type { WidgetMetadata } from './types';
import { clockWidget } from './clock';
import { weatherWidget } from './weather';
import { calendarWidget } from './calendar';
import { remindersWidget } from './reminders';
import { stickyNoteWidget } from './sticky-note';
import { dailyQuoteWidget } from './daily-quote';
import { todayListWidget } from './today-list';
import { householdWidget } from './household';
import { minimalTextWidget } from './minimal-text';
import { newsWidget } from './news';
import { virtualTryOnWidget } from './virtual-try-on';

export const WIDGET_REGISTRY: Record<string, WidgetMetadata> = {
  clock: clockWidget,
  weather: weatherWidget,
  calendar: calendarWidget,
  news: newsWidget,
  virtual_try_on: virtualTryOnWidget,
  reminders: remindersWidget,
  sticky_note: stickyNoteWidget,
  daily_quote: dailyQuoteWidget,
  today_list: todayListWidget,
  household: householdWidget,
  minimal_text: minimalTextWidget,
};

/**
 * Resolve metadata for `clock`, `daily_quote`, or instance ids like `daily_quote:173…`.
 * Widget ids from DB / sync may use any casing (e.g. `DAILY_QUOTE:…`); registry keys are lowercase.
 */
export function getWidgetMetadata(type: string): WidgetMetadata | undefined {
  if (!type) return undefined;
  const raw = type.trim();
  if (WIDGET_REGISTRY[raw]) return WIDGET_REGISTRY[raw];
  const colon = raw.indexOf(':');
  const base = colon > 0 ? raw.slice(0, colon).toLowerCase() : raw.toLowerCase();
  return WIDGET_REGISTRY[base];
}

/** Add a new entry in WIDGET_REGISTRY after creating `features/widgets/<id>/`. */
export { UnknownWidget } from './UnknownWidget';
