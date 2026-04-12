import type { WidgetMetadata } from '../types';
import { VirtualTryOnWidget } from './VirtualTryOnWidget';

export const virtualTryOnWidget: WidgetMetadata = {
  title: 'Virtual Try-On',
  defaultGrid: { rowSpan: 1, colSpan: 1 },
  minSize: { width: 260, height: 180 },
  Component: VirtualTryOnWidget,
};
