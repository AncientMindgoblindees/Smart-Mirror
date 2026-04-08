import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Circle, CheckCircle2 } from 'lucide-react';
import type { WidgetConfig } from '../types';
import { computeDisplayScale, estimatePageSize, useDisplayPagination } from '../useDisplayPagination';
import './reminders-widget.css';

type ReminderItem = { text: string; done?: boolean };

const DEFAULT_ITEMS: ReminderItem[] = [
  { text: 'Stretch and hydrate', done: true },
  { text: 'Review your daily goals' },
  { text: 'Prepare outfit for tomorrow' },
  { text: 'Charge wearable devices' },
  { text: 'Quick inbox cleanup' },
];

export const RemindersWidget: React.FC<{ config: WidgetConfig }> = React.memo(({ config }) => {
  const itemsRaw = Array.isArray((config as unknown as Record<string, unknown>).items)
    ? ((config as unknown as Record<string, unknown>).items as unknown[])
    : [];
  const items: ReminderItem[] =
    itemsRaw
      .map((x) => (typeof x === 'string' ? { text: x } : null))
      .filter((x): x is ReminderItem => Boolean(x && x.text.trim())) || [];
  const list = items.length > 0 ? items : DEFAULT_ITEMS;
  const scale = computeDisplayScale(config.freeform.width, config.freeform.height);
  const pageSize = estimatePageSize(config.freeform.width, config.freeform.height);
  const { pageItems, pageIndex, pageCount } = useDisplayPagination(list, pageSize, 7000);

  return (
    <div className="widget-content reminders-widget" style={{ fontSize: `${scale}em` }}>
      <AnimatePresence mode="wait">
        <motion.ul
          key={pageIndex}
          className="reminders-list"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          {pageItems.map((item, idx) => (
            <motion.li
              key={`${item.text}-${idx}`}
              className={item.done ? 'reminder-done' : ''}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{
                delay: idx * 0.05,
                type: 'spring',
                stiffness: 300,
                damping: 28,
              }}
            >
              <span className="reminder-check" aria-hidden="true">
                {item.done ? (
                  <CheckCircle2 size="1em" />
                ) : (
                  <Circle size="1em" />
                )}
              </span>
              <span className="reminder-text">{item.text}</span>
            </motion.li>
          ))}
        </motion.ul>
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

RemindersWidget.displayName = 'RemindersWidget';
