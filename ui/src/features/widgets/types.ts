import React from 'react';

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
  /**
   * Freeform layout as fraction of the mirror canvas (0–100).
   * x,y = top-left; width,height = size; all in percent of canvas width/height.
   */
  freeform: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /** Custom `custom:*` content from `config_json` (config app). */
  title?: string;
  text?: string;
  templateId?: string;
}

export interface WidgetMetadata {
  title: string;
  defaultGrid: { rowSpan: number; colSpan: number };
  minSize: { width: number; height: number };
  Component: React.ComponentType<{ config: WidgetConfig }>;
}
