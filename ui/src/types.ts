import React from 'react';

export type LayoutMode = 'freeform' | 'grid' | 'focus' | 'split';

export interface WidgetConfig {
  /** Stable client id (includes backend id when synced: `w-<dbId>`). */
  id: string;
  /** Database primary key when persisted via backend. */
  backendId?: number;
  type: string;
  enabled: boolean;
  grid: {
    row: number;
    col: number;
    rowSpan: number;
    colSpan: number;
  };
  freeform: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface WidgetMetadata {
  title: string;
  defaultGrid: { rowSpan: number; colSpan: number };
  minSize: { width: number; height: number };
  Component: React.ComponentType<{ config: WidgetConfig; layoutMode: LayoutMode }>;
}
