import type { WidgetMetadata } from '../types';
import { MinimalTextWidget } from './MinimalTextWidget';

export const minimalTextWidget: WidgetMetadata = {
  title: 'Message',
  defaultGrid: { rowSpan: 1, colSpan: 1 },
  minSize: { width: 180, height: 90 },
  Component: MinimalTextWidget,
};
