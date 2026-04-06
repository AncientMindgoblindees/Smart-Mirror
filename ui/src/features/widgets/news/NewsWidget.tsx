import React, { useEffect, useState } from 'react';
import type { WidgetConfig } from '../types';
import { getNewsHeadlinesPreview, type NewsHeadline } from '@/features/ai/entrypoints';
import './news-widget.css';

export const NewsWidget: React.FC<{ config: WidgetConfig }> = () => {
  const [headlines, setHeadlines] = useState<NewsHeadline[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const items = await getNewsHeadlinesPreview(5);
        if (mounted) setHeadlines(items);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="widget-content news-widget">
      {loading ? (
        <div className="magic-sparkle" aria-label="Loading headlines">Collecting headlines…</div>
      ) : (
        <ul className="news-list">
          {headlines.map((item, idx) => (
            <li key={`${item.source}-${idx}`}>
              <span className="news-dot" aria-hidden="true" />
              <div>
                <p className="news-title">{item.title}</p>
                <p className="news-source">{item.source}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
