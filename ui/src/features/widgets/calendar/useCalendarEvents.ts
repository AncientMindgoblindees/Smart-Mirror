import { getCalendarEvents } from '@/api/mirrorApi';
import type { CalendarEventsResponse } from '@/api/backendTypes';
import { toCalendarEventDisplay, type CalendarEventDisplay } from '@/api/transforms/calendar';
import { useCalendarFeed } from './useCalendarFeed';

export function useCalendarEvents(): {
  events: CalendarEventDisplay[];
  hasProviders: boolean;
  loading: boolean;
} {
  const { items, hasProviders, loading } = useCalendarFeed<CalendarEventsResponse, CalendarEventDisplay>({
    fetcher: () => getCalendarEvents({ days: 3 }),
    mapItems: (resp) => resp.events.map(toCalendarEventDisplay),
  });
  return { events: items, hasProviders, loading };
}

export type { CalendarEventDisplay };
