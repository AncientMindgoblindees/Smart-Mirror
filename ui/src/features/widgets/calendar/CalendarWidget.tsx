import React from 'react';
import type { WidgetConfig } from '../types';
import { computeDisplayScale, estimatePageSize, useDisplayPagination } from '../useDisplayPagination';
import './calendar-widget.css';

type CalendarEvent = { time: string; event: string };

const DEFAULT_EVENTS: CalendarEvent[] = [
  { time: '09:00', event: 'Morning Standup' },
  { time: '13:00', event: 'Product Review' },
  { time: '16:30', event: 'Design Sync' },
  { time: '19:00', event: 'Gym Session' },
  { time: '20:30', event: 'Family Dinner' },
];

export const CalendarWidget: React.FC<{ config: WidgetConfig }> = ({ config }) => {
  const events = DEFAULT_EVENTS;
  const scale = computeDisplayScale(config.freeform.width, config.freeform.height);
  const pageSize = estimatePageSize(config.freeform.width, config.freeform.height);
  const { pageItems, pageIndex, pageCount } = useDisplayPagination(events, pageSize, 7000);

  return (
    <div className="widget-content calendar-widget" style={{ fontSize: `${scale}em` }}>
      {pageItems.map((item, idx) => (
        <div className="calendar-item" key={`${item.time}-${idx}`}>
          <span className="time">{item.time}</span>
          <span className="event">{item.event}</span>
        </div>
      ))}
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
