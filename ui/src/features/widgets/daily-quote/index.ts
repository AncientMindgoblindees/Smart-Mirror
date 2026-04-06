import type { WidgetMetadata } from '../types';
import { DailyQuoteWidget } from './DailyQuoteWidget';

export const dailyQuoteWidget: WidgetMetadata = {
  title: 'Quote',
  defaultGrid: { rowSpan: 1, colSpan: 1 },
  minSize: { width: 220, height: 100 },
  Component: DailyQuoteWidget,
};
