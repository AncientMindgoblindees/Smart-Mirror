import React from 'react';
import type { WidgetConfig } from '../types';
import { computeDisplayScale, estimatePageSize, useDisplayPagination } from '../useDisplayPagination';
import './reminders-widget.css';

type ReminderItem = { text: string };

const DEFAULT_ITEMS: ReminderItem[] = [
  { text: 'Stretch and hydrate' },
  { text: 'Review your daily goals' },
  { text: 'Prepare outfit for tomorrow' },
  { text: 'Charge wearable devices' },
  { text: 'Quick inbox cleanup' },
];

export const RemindersWidget: React.FC<{ config: WidgetConfig }> = ({ config }) => {
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
      <ul className="reminders-list">
        {pageItems.map((item, idx) => (
          <li key={`${item.text}-${idx}`}>{item.text}</li>
        ))}
      </ul>
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
