import type { WidgetMetadata } from '../types';
import { StickyNoteWidget } from './StickyNoteWidget';

export const stickyNoteWidget: WidgetMetadata = {
  title: 'Note',
  defaultGrid: { rowSpan: 1, colSpan: 1 },
  minSize: { width: 200, height: 120 },
  Component: StickyNoteWidget,
};
