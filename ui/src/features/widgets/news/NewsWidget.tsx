import React, { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { WidgetConfig } from '../types';
import { getNews } from '@/api/mirrorApi';
import type { NewsHeadlineOut } from '@/api/backendTypes';
import { estimatePageSize, useDisplayPagination } from '../useDisplayPagination';
import './news-widget.css';

const DEFAULT_FEED_CATEGORIES = ['general', 'tech', 'business'];
const CATEGORY_LABELS: Record<string, string> = {
  business: 'Business',
  entertainment: 'Entertainment',
  food: 'Food',
  general: 'General',
  health: 'Health',
  politics: 'Politics',
  science: 'Science',
  sports: 'Sports',
  tech: 'Technology',
  travel: 'Travel',
};

type NewsFeedView = {
  id: string;
  label: string;
  headlines: NewsHeadlineOut[];
};

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

function parseCsv(value: string): string[] {
  return value
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

function labelForFeed(category: string, search: string): string {
  if (category) {
    return CATEGORY_LABELS[category] ?? category.replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
  if (search) return 'Search';
  return 'Top Stories';
}

function buildFeedRequests(categories: string, search: string): Array<{ id: string; label: string; categories: string }> {
  const categoryList = parseCsv(categories);
  const feedCategories = categoryList.length > 0 ? categoryList : search ? [''] : DEFAULT_FEED_CATEGORIES;
  return feedCategories.map((category, index) => ({
    id: category || `top-${index}`,
    label: labelForFeed(category, search),
    categories: category,
  }));
}

export const NewsWidget: React.FC<{ config: WidgetConfig }> = React.memo(({ config }) => {
  const [feeds, setFeeds] = useState<NewsFeedView[]>([]);
  const [feedIndex, setFeedIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const itemLimit = Math.max(1, Math.min(10, Number(config.limit ?? 5)));
  const locale = config.locale?.trim() || 'us';
  const language = config.language?.trim() || 'en';
  const categories = config.categories?.trim() || '';
  const search = config.search?.trim() || '';
  const pageSize = estimatePageSize(config.freeform.width, config.freeform.height);
  const activeFeedIndex = feeds.length > 0 ? feedIndex % feeds.length : 0;
  const activeFeed = feeds.length > 0 ? feeds[activeFeedIndex] : null;
  const { pageItems, pageIndex, pageCount } = useDisplayPagination(activeFeed?.headlines ?? [], pageSize, 8000);

  const loadNews = useCallback(async () => {
    setError(null);
    try {
      const settled = await Promise.all(
        buildFeedRequests(categories, search).map(async (request) => {
          const feed = await getNews({
            limit: itemLimit,
            locale,
            language,
            categories: request.categories,
            search,
          });
          return { request, feed };
        }),
      );

      if (settled.some((item) => !item.feed.configured)) {
        setFeeds([]);
        setError('News API is not configured.');
        return;
      }

      const liveFeeds = settled
        .filter((item) => item.feed.live)
        .map(
          (item): NewsFeedView => ({
            id: item.request.id,
            label: item.request.label,
            headlines: item.feed.headlines,
          }),
        )
        .filter((item) => item.headlines.length > 0);

      if (liveFeeds.length === 0) {
        setFeeds([]);
        const firstError = settled.find((item) => item.feed.error?.trim())?.feed.error?.trim();
        setError(firstError || 'News data is unavailable.');
        return;
      }

      setFeeds(liveFeeds);
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

  useEffect(() => {
    setFeedIndex(0);
  }, [categories, feeds.length, search]);

  useEffect(() => {
    if (feeds.length <= 1) return;
    const id = window.setInterval(() => {
      setFeedIndex((current) => (current + 1) % feeds.length);
    }, 10000);
    return () => window.clearInterval(id);
  }, [feeds.length]);

  return (
    <div className="widget-content news-widget">
      <div className="news-header">
        <span className="news-header-label">{activeFeed ? `${activeFeed.label} Briefing` : 'Live Briefing'}</span>
        {feeds.length > 1 && <span className="news-header-count">{activeFeedIndex + 1}/{feeds.length}</span>}
        <span className="news-header-pulse" aria-hidden="true" />
      </div>

      {loading ? (
        <SkeletonLoader />
      ) : error ? (
        <div className="news-state">{error}</div>
      ) : !activeFeed || activeFeed.headlines.length === 0 ? (
        <div className="news-state">No headlines available right now.</div>
      ) : (
        <AnimatePresence mode="wait">
          <motion.ul
            key={`${activeFeed.id}-${pageIndex}`}
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
