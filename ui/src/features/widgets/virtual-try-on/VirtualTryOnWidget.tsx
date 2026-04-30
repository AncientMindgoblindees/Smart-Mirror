import React, { useState } from 'react';
import type { WidgetConfig } from '../types';
import { requestVirtualTryOnPreview } from '@/features/ai/entrypoints';
import './virtual-try-on-widget.css';

export const VirtualTryOnWidget: React.FC<{ config: WidgetConfig }> = () => {
  const [status, setStatus] = useState('Ready');

  const onAction = async () => {
    setStatus('Preparing preview…');
    const result = await requestVirtualTryOnPreview();
    setStatus(result.message);
  };

  return (
    <div className="widget-content vto-widget">
      <div className="vto-preview" aria-hidden="true">
        <div className="vto-preview-inner">Mirror preview</div>
      </div>
      <button type="button" className="vto-action" onClick={onAction}>
        Start Virtual Try-On
      </button>
      <p className="vto-status">{status}</p>
    </div>
  );
};
