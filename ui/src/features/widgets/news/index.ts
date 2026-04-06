import type { WidgetMetadata } from '../types';
import { NewsWidget } from './NewsWidget';

export const newsWidget: WidgetMetadata = {
  title: 'News',
  defaultGrid: { rowSpan: 2, colSpan: 2 },
  minSize: { width: 340, height: 220 },
  Component: NewsWidget,
};
