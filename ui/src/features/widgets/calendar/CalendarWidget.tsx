import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { WidgetConfig } from '../types';
import { estimatePageSize, useDisplayPagination } from '../useDisplayPagination';
import { useCalendarEvents } from './useCalendarEvents';
import type { CalendarEventDisplay } from './useCalendarEvents';
import './calendar-widget.css';

const ACCENT_COLORS = ['#60a5fa', '#f5a623', '#34d399', '#a78bfa', '#f472b6'];
const PAGE_SIZE_CAP_BY_PRESET = {
  small: 3,
  medium: 5,
  large: 6,
} as const;

function resolveCalendarPageSize(config: WidgetConfig): number {
  const base = estimatePageSize(config.freeform.width, config.freeform.height);
  const preset = config.freeform.sizePreset;
  if (!preset) return base;
  const cap = PAGE_SIZE_CAP_BY_PRESET[preset];
  return Math.min(base, cap);
}

function getRelativeLabel(timeStr: string): string | null {
  if (timeStr === 'All day') return null;
  const now = new Date();
  const [h, m] = timeStr.split(':').map(Number);
  const eventDate = new Date(now);
  eventDate.setHours(h, m, 0, 0);
  const diffMin = Math.round((eventDate.getTime() - now.getTime()) / 60000);

  if (diffMin > -15 && diffMin <= 0) return 'Now';
  if (diffMin > 0 && diffMin <= 60) return `in ${diffMin}m`;
  return null;
}

const EmptyState: React.FC = () => (
  <div className="calendar-empty">
    <span className="calendar-empty-text">No upcoming events</span>
  </div>
);

export const CalendarWidget: React.FC<{ config: WidgetConfig }> = React.memo(({ config }) => {
  const { events, loading } = useCalendarEvents();
  const pageSize = resolveCalendarPageSize(config);
  const { pageItems, pageIndex, pageCount } = useDisplayPagination<CalendarEventDisplay>(
    events,
    pageSize,
    7000,
  );

  if (!loading && events.length === 0) {
    return (
      <div className="widget-content calendar-widget">
        <EmptyState />
      </div>
    );
  }

  return (
    <div className="widget-content calendar-widget">
      <AnimatePresence mode="wait">
        <motion.div
          key={pageIndex}
          className="calendar-page"
          data-count={Math.max(1, pageItems.length)}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        >
          {pageItems.map((item, idx) => {
            const relLabel = getRelativeLabel(item.time);
            const isNow = relLabel === 'Now';
            const color = ACCENT_COLORS[idx % ACCENT_COLORS.length];

            return (
              <motion.div
                className={`calendar-item ${isNow ? 'calendar-item-now' : ''}`}
                key={`${item.time}-${idx}`}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{
                  delay: idx * 0.06,
                  type: 'spring',
                  stiffness: 300,
                  damping: 28,
                }}
                style={{ ['--accent-color' as string]: color }}
              >
                <span className="calendar-bar" aria-hidden="true" />
                <span className="calendar-time">
                  <span className="calendar-day">{item.dayLabel}</span>
                  <span className="calendar-clock">{item.timeLabel}</span>
                  {relLabel && <span className="calendar-rel">{relLabel}</span>}
                </span>
                <span className="calendar-main">
                  <span className="calendar-event">{item.event}</span>
                  <span className="calendar-meta">{item.detailLabel}</span>
                </span>
              </motion.div>
            );
          })}
        </motion.div>
      </AnimatePresence>

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

CalendarWidget.displayName = 'CalendarWidget';
