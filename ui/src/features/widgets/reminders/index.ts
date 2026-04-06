import type { WidgetMetadata } from '../types';
import { RemindersWidget } from './RemindersWidget';

export const remindersWidget: WidgetMetadata = {
  title: 'Reminders',
  defaultGrid: { rowSpan: 1, colSpan: 2 },
  minSize: { width: 200, height: 120 },
  Component: RemindersWidget,
};
