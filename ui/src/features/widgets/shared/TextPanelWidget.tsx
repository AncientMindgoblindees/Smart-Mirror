import React from 'react';
import type { WidgetConfig } from '../types';

/** Title + body from `config_json` for sticky note, quote, list, etc. */
export const TextPanelWidget: React.FC<{ config: WidgetConfig }> = ({ config }) => (
  <div className="widget-content">
    {config.title ? <p style={{ fontWeight: 600, marginBottom: '0.35em' }}>{config.title}</p> : null}
    {config.text ? (
      <p style={{ color: 'var(--color-text-secondary)', whiteSpace: 'pre-wrap', fontSize: '0.95em' }}>
        {config.text}
      </p>
    ) : null}
  </div>
);
