import React from 'react';
import type { WidgetConfig } from './types';

export const UnknownWidget: React.FC<{ config: WidgetConfig }> = ({ config }) => (
  <div className="widget-content">
    <p style={{ color: 'var(--color-text-secondary)' }}>Unknown widget type: {config.type}</p>
  </div>
);
