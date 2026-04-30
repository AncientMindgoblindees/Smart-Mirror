import React, { useEffect, useState } from 'react';
import type { WidgetConfig } from '../types';
import './virtual-try-on-widget.css';

export const VirtualTryOnWidget: React.FC<{ config: WidgetConfig }> = (_props) => {
  const [status, setStatus] = useState('Waiting for a try-on from the companion…');
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  useEffect(() => {
    const onResult = (e: Event) => {
      const d = (e as CustomEvent<{ image_url?: string }>).detail;
      const url = typeof d?.image_url === 'string' ? d.image_url : '';
      if (url) {
        setResultUrl(url);
        setStatus('Latest try-on');
      }
    };
    window.addEventListener('mirror:tryon_result', onResult);
    return () => window.removeEventListener('mirror:tryon_result', onResult);
  }, []);

  return (
    <div className="widget-content vto-widget">
      <div className="vto-preview" aria-hidden="true">
        {resultUrl ? (
          <img src={resultUrl} alt="" className="vto-result-img" referrerPolicy="no-referrer" />
        ) : (
          <div className="vto-preview-inner">Mirror preview</div>
        )}
      </div>
      <p className="vto-status">{status}</p>
    </div>
  );
};
