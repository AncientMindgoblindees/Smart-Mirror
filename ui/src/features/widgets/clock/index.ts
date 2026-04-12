import type { WidgetMetadata } from '../types';
import { ClockWidget } from './ClockWidget';

export const clockWidget: WidgetMetadata = {
  title: 'Clock',
  defaultGrid: { rowSpan: 1, colSpan: 2 },
  minSize: { width: 300, height: 150 },
  Component: ClockWidget,
};
