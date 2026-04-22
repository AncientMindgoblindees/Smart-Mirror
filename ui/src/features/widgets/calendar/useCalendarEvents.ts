import { getCalendarEvents } from '@/api/mirrorApi';
import type { CalendarEventsResponse } from '@/api/backendTypes';
import {
  toCalendarEventDisplay,
  type CalendarEventDisplay,
  type CalendarTimeFormat,
} from '@/api/transforms/calendar';
import { useCalendarFeed } from './useCalendarFeed';

export function useCalendarEvents(timeFormat: CalendarTimeFormat = '24h'): {
  events: CalendarEventDisplay[];
  hasProviders: boolean;
  loading: boolean;
} {
  const { items, hasProviders, loading } = useCalendarFeed<CalendarEventsResponse, CalendarEventDisplay>({
    fetcher: (signal) => getCalendarEvents({ days: 3 }, { signal }),
    mapItems: (resp) => resp.events.map((event) => toCalendarEventDisplay(event, timeFormat)),
  });
  return { events: items, hasProviders, loading };
}

export type { CalendarEventDisplay };
