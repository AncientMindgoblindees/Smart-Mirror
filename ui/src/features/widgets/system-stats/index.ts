import type { WidgetMetadata } from '../types';
import { SystemStatsWidget } from './SystemStatsWidget';

export const systemStatsWidget: WidgetMetadata = {
  title: 'System Stats',
  defaultGrid: { rowSpan: 1, colSpan: 1 },
  minSize: { width: 250, height: 180 },
  Component: SystemStatsWidget,
};
