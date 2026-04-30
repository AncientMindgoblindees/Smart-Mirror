import { describe, expect, it } from 'vitest';
import { toCalendarEventDisplay } from './calendar';
import type { CalendarEventItem } from '@/api/backendTypes';

function makeEvent(overrides: Partial<CalendarEventItem> = {}): CalendarEventItem {
  return {
    id: 1,
    type: 'event',
    title: 'Standup',
    start_time: '2026-04-19T13:05:00.000Z',
    end_time: '2026-04-19T13:35:00.000Z',
    all_day: false,
    source: 'google',
    priority: 'normal',
    completed: false,
    metadata: {},
    ...overrides,
  };
}

describe('toCalendarEventDisplay', () => {
  it('formats event time in 24-hour mode', () => {
    const out = toCalendarEventDisplay(makeEvent(), '24h');
    expect(out.time).toMatch(/\d{2}:\d{2}/);
    expect(out.time).not.toMatch(/AM|PM/i);
    expect(out.timeLabel).not.toMatch(/AM|PM/i);
    expect(out.startMs).not.toBeNull();
  });

  it('formats event time in 12-hour mode with meridiem', () => {
    const out = toCalendarEventDisplay(makeEvent(), '12h');
    expect(out.time).toMatch(/AM|PM/i);
    expect(out.timeLabel).toMatch(/AM|PM/i);
    expect(out.startMs).not.toBeNull();
  });

  it('returns all-day labels for all-day events', () => {
    const out = toCalendarEventDisplay(
      makeEvent({
        all_day: true,
        start_time: '2026-04-19',
        end_time: null,
      }),
      '12h',
    );
    expect(out.time).toBe('All day');
    expect(out.timeLabel).toBe('All day');
  });
});
