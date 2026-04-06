import React, { useEffect, useState } from 'react';
import type { WidgetConfig } from '../types';
import { getNewsHeadlinesPreview, type NewsHeadline } from '@/features/ai/entrypoints';
import { computeDisplayScale, estimatePageSize, useDisplayPagination } from '../useDisplayPagination';
import './news-widget.css';

function formatRelativeMinutes(iso: string): string {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return 'recently';
  const diffMin = Math.max(1, Math.floor((Date.now() - ts) / 60000));
  if (diffMin < 60) return `${diffMin}m ago`;
  const hours = Math.floor(diffMin / 60);
  return `${hours}h ago`;
}

export const NewsWidget: React.FC<{ config: WidgetConfig }> = ({ config }) => {
  const [headlines, setHeadlines] = useState<NewsHeadline[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const summaryEnabled = Boolean(config?.integration?.provider);
  const itemLimit = Math.max(3, Math.min(8, Number((config as unknown as Record<string, unknown>)?.limit ?? 5)));
  const scale = computeDisplayScale(config.freeform.width, config.freeform.height);
  const pageSize = estimatePageSize(config.freeform.width, config.freeform.height);
  const { pageItems, pageIndex, pageCount } = useDisplayPagination(headlines, pageSize, 8000);

  const loadNews = async () => {
    setError(null);
    try {
      const items = await getNewsHeadlinesPreview(itemLimit, {
        provider: 'mock',
        includeSummary: summaryEnabled,
      });
      setHeadlines(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load headlines');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!mounted) return;
      await loadNews();
    })();
    return () => {
      mounted = false;
    };
  }, [itemLimit, summaryEnabled]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void loadNews();
    }, 5 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [itemLimit, summaryEnabled]);

  return (
    <div className="widget-content news-widget" style={{ fontSize: `${scale}em` }}>
      <div className="news-header">
        <p className="news-header-label">Live Briefing</p>
      </div>
      {loading ? (
        <div className="magic-sparkle" aria-label="Loading headlines">Collecting headlines…</div>
      ) : error ? (
        <div className="news-state">{error}</div>
      ) : headlines.length === 0 ? (
        <div className="news-state">No headlines available right now.</div>
      ) : (
        <ul className="news-list">
          {pageItems.map((item) => (
            <li key={item.id}>
              <span className="news-dot" aria-hidden="true" />
              <div>
                <p className="news-title">{item.title}</p>
                <p className="news-meta">
                  <span className="news-source">{item.source}</span>
                  <span className="news-sep">•</span>
                  <span>{item.category}</span>
                  <span className="news-sep">•</span>
                  <span>{formatRelativeMinutes(item.published_at)}</span>
                </p>
                {item.summary && <p className="news-summary">{item.summary}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {pageCount > 1 && (
        <div className="pager-dots" aria-hidden="true">
          {Array.from({ length: pageCount }).map((_, i) => (
            <span key={i} className={`pager-dot ${i === pageIndex ? 'active' : ''}`} />
          ))}
        </div>
      )}
    </div>
  );
};
