import type { WidgetMetadata } from '../types';
import { EmailWidget } from './EmailWidget';

export const emailWidget: WidgetMetadata = {
  title: 'Email',
  defaultGrid: { rowSpan: 2, colSpan: 2 },
  minSize: { width: 300, height: 240 },
  Component: EmailWidget,
};
