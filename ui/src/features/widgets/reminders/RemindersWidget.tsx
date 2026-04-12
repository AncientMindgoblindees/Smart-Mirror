import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Circle, CheckCircle2 } from 'lucide-react';
import type { WidgetConfig } from '../types';
import { estimatePageSize, useDisplayPagination } from '../useDisplayPagination';
import { useCalendarTasks } from './useCalendarTasks';
import type { ReminderDisplay } from './useCalendarTasks';
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
  const { tasks, hasProviders, loading } = useCalendarTasks();

  const configItems: ReminderItem[] = (
    Array.isArray((config as unknown as Record<string, unknown>).items)
      ? ((config as unknown as Record<string, unknown>).items as unknown[])
          .map((x) => (typeof x === 'string' ? { text: x } : null))
          .filter((x): x is ReminderItem => Boolean(x && x.text.trim()))
      : []
  );

  let list: ReminderDisplay[];
  if (tasks.length > 0) {
    list = tasks;
  } else if (configItems.length > 0) {
    list = configItems.map((i) => ({ text: i.text, done: i.done ?? false }));
  } else if (!hasProviders && !loading) {
    list = DEFAULT_ITEMS.map((i) => ({ text: i.text, done: i.done ?? false }));
  } else {
    list = [];
  }

  const pageSize = estimatePageSize(config.freeform.width, config.freeform.height);
  const { pageItems, pageIndex, pageCount } = useDisplayPagination<ReminderDisplay>(
    list,
    pageSize,
    7000,
  );

  if (!loading && list.length === 0 && hasProviders) {
    return (
      <div className="widget-content reminders-widget">
        <div style={{ opacity: 0.4, fontSize: '0.9em', textAlign: 'center', padding: '1rem' }}>
          No tasks
        </div>
      </div>
    );
  }

  return (
    <div className="widget-content reminders-widget">
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
