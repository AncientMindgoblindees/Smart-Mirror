import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { WidgetConfig } from '../types';
import { estimatePageSize, useDisplayPagination } from '../useDisplayPagination';
import './calendar-widget.css';

type CalendarEvent = { time: string; event: string };

const DEFAULT_EVENTS: CalendarEvent[] = [
  { time: '09:00', event: 'Morning Standup' },
  { time: '13:00', event: 'Product Review' },
  { time: '16:30', event: 'Design Sync' },
  { time: '19:00', event: 'Gym Session' },
  { time: '20:30', event: 'Family Dinner' },
];

const ACCENT_COLORS = ['#60a5fa', '#f5a623', '#34d399', '#a78bfa', '#f472b6'];

function getRelativeLabel(timeStr: string): string | null {
  const now = new Date();
  const [h, m] = timeStr.split(':').map(Number);
  const eventDate = new Date(now);
  eventDate.setHours(h, m, 0, 0);
  const diffMin = Math.round((eventDate.getTime() - now.getTime()) / 60000);

  if (diffMin > -15 && diffMin <= 0) return 'Now';
  if (diffMin > 0 && diffMin <= 60) return `in ${diffMin}m`;
  return null;
}

export const CalendarWidget: React.FC<{ config: WidgetConfig }> = React.memo(({ config }) => {
  const events = DEFAULT_EVENTS;
  const pageSize = estimatePageSize(config.freeform.width, config.freeform.height);
  const { pageItems, pageIndex, pageCount } = useDisplayPagination(events, pageSize, 7000);

  return (
    <div className="widget-content calendar-widget">
      <AnimatePresence mode="wait">
        <motion.div
          key={pageIndex}
          className="calendar-page"
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
                  {item.time}
                  {relLabel && <span className="calendar-rel">{relLabel}</span>}
                </span>
                <span className="calendar-event">{item.event}</span>
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
