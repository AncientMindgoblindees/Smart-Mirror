import type { WidgetMetadata } from '../types';
import { TodayListWidget } from './TodayListWidget';

export const todayListWidget: WidgetMetadata = {
  title: 'Today',
  defaultGrid: { rowSpan: 1, colSpan: 1 },
  minSize: { width: 200, height: 140 },
  Component: TodayListWidget,
};
