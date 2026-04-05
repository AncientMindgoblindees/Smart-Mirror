import type { WidgetMetadata } from './types';
import { clockWidget } from './clock';
import { weatherWidget } from './weather';
import { calendarWidget } from './calendar';

export const WIDGET_REGISTRY: Record<string, WidgetMetadata> = {
  clock: clockWidget,
  weather: weatherWidget,
  calendar: calendarWidget,
};

export function getWidgetMetadata(type: string): WidgetMetadata | undefined {
  return WIDGET_REGISTRY[type];
}

/** Add a new entry in WIDGET_REGISTRY after creating `features/widgets/<id>/`. */
export { UnknownWidget } from './UnknownWidget';
