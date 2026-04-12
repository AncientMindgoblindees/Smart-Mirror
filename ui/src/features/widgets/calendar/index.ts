import type { WidgetMetadata } from '../types';
import { CalendarWidget } from './CalendarWidget';

export const calendarWidget: WidgetMetadata = {
  title: 'Calendar',
  defaultGrid: { rowSpan: 2, colSpan: 1 },
  minSize: { width: 250, height: 300 },
  Component: CalendarWidget,
};
