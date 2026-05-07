import React, { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { WidgetConfig } from '../types';
import { getNews } from '@/api/mirrorApi';
import type { NewsHeadlineOut } from '@/api/backendTypes';
import { estimatePageSize, useDisplayPagination } from '../useDisplayPagination';
import './news-widget.css';

function formatRelativeMinutes(iso: string): string {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return 'recently';
  const diffMin = Math.max(1, Math.floor((Date.now() - ts) / 60000));
  if (diffMin < 60) return `${diffMin}m ago`;
  const hours = Math.floor(diffMin / 60);
  return `${hours}h ago`;
}

function SkeletonLine({ width }: { width: string }) {
  return <div className="skeleton-line" style={{ width }} />;
}

function SkeletonLoader() {
  return (
    <div className="news-skeleton">
      {[0, 1, 2].map((i) => (
        <div key={i} className="skeleton-item" style={{ animationDelay: `${i * 0.12}s` }}>
          <div className="skeleton-dot" />
          <div className="skeleton-body">
            <SkeletonLine width="90%" />
            <SkeletonLine width="55%" />
          </div>
        </div>
      ))}
    </div>
  );
}

const CATEGORY_COLORS: Record<string, string> = {
  Business: '#60a5fa',
  Technology: '#a78bfa',
  Science: '#34d399',
  Health: '#f472b6',
  Space: '#818cf8',
  Local: '#fbbf24',
};

export const NewsWidget: React.FC<{ config: WidgetConfig }> = React.memo(({ config }) => {
  const [headlines, setHeadlines] = useState<NewsHeadlineOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const itemLimit = Math.max(1, Math.min(10, Number(config.limit ?? 5)));
  const locale = config.locale?.trim() || 'us';
  const language = config.language?.trim() || 'en';
  const categories = config.categories?.trim() || '';
  const search = config.search?.trim() || '';
  const pageSize = estimatePageSize(config.freeform.width, config.freeform.height);
  const { pageItems, pageIndex, pageCount } = useDisplayPagination(headlines, pageSize, 8000);

  const loadNews = useCallback(async () => {
    setError(null);
    try {
      const feed = await getNews({
        limit: itemLimit,
        locale,
        language,
        categories,
        search,
      });
      if (!feed.configured) {
        setHeadlines([]);
        setError('News API is not configured.');
        return;
      }
      if (!feed.live) {
        setHeadlines([]);
        setError(feed.error?.trim() || 'News data is unavailable.');
        return;
      }
      setHeadlines(feed.headlines);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load headlines');
    } finally {
      setLoading(false);
    }
  }, [categories, itemLimit, language, locale, search]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!mounted) return;
      await loadNews();
    })();
    return () => { mounted = false; };
  }, [loadNews]);

  useEffect(() => {
    const id = window.setInterval(() => { void loadNews(); }, 5 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [loadNews]);

  return (
    <div className="widget-content news-widget">
      <div className="news-header">
        <span className="news-header-label">Live Briefing</span>
        <span className="news-header-pulse" aria-hidden="true" />
      </div>

      {loading ? (
        <SkeletonLoader />
      ) : error ? (
        <div className="news-state">{error}</div>
      ) : headlines.length === 0 ? (
        <div className="news-state">No headlines available right now.</div>
      ) : (
        <AnimatePresence mode="wait">
          <motion.ul
            key={pageIndex}
            className="news-list"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          >
            {pageItems.map((item, idx) => (
              <motion.li
                key={item.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: idx * 0.06,
                  type: 'spring',
                  stiffness: 300,
                  damping: 28,
                }}
              >
                <span
                  className="news-dot"
                  aria-hidden="true"
                  style={{ background: CATEGORY_COLORS[item.category] ?? 'rgba(255,255,255,0.5)' }}
                />
                <div>
                  <p className="news-title">{item.title}</p>
                  <p className="news-meta">
                    <span className="news-source">{item.source}</span>
                    <span className="news-sep">·</span>
                    <span>{item.category}</span>
                    <span className="news-sep">·</span>
                    <span>{formatRelativeMinutes(item.published_at)}</span>
                  </p>
                  {item.summary && <p className="news-summary">{item.summary}</p>}
                </div>
              </motion.li>
            ))}
          </motion.ul>
        </AnimatePresence>
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
});

NewsWidget.displayName = 'NewsWidget';
