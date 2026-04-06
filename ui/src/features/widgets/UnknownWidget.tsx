import React from 'react';
import type { WidgetConfig } from './types';

export const UnknownWidget: React.FC<{ config: WidgetConfig }> = ({ config }) => {
  const isCustom = config.type.trim().toLowerCase().startsWith('custom:');
  if (isCustom && (config.text || config.title)) {
    return (
      <div className="widget-content">
        {config.title ? (
          <p style={{ fontWeight: 600, marginBottom: '0.35em' }}>{config.title}</p>
        ) : null}
        {config.text ? (
          <p style={{ color: 'var(--color-text-secondary)', whiteSpace: 'pre-wrap', fontSize: '0.95em' }}>
            {config.text}
          </p>
        ) : null}
      </div>
    );
  }
  return (
    <div className="widget-content">
      <p style={{ color: 'var(--color-text-secondary)' }}>Unknown widget type: {config.type}</p>
    </div>
  );
};
