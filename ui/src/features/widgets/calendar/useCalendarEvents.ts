import { useCallback, useEffect, useRef, useState } from 'react';
import { getCalendarEvents } from '@/api/mirrorApi';
import type { CalendarEventItem } from '@/api/backendTypes';

const POLL_INTERVAL = 60_000; // 1 minute

export type CalendarEventDisplay = {
  time: string;
  event: string;
  allDay: boolean;
  source: string;
};

function formatTime(iso: string | null | undefined, allDay: boolean): string {
  if (allDay || !iso) return 'All day';
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    return '';
  }
}

function toDisplay(item: CalendarEventItem): CalendarEventDisplay {
  return {
    time: formatTime(item.start_time, item.all_day),
    event: item.title,
    allDay: item.all_day,
    source: item.source,
  };
}

export function useCalendarEvents(): {
  events: CalendarEventDisplay[];
  hasProviders: boolean;
  loading: boolean;
} {
  const [events, setEvents] = useState<CalendarEventDisplay[]>([]);
  const [hasProviders, setHasProviders] = useState(false);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  const fetchEvents = useCallback(async () => {
    try {
      const resp = await getCalendarEvents({ days: 3 });
      if (!mountedRef.current) return;
      setEvents(resp.events.map(toDisplay));
      setHasProviders(resp.providers.length > 0);
    } catch {
      // keep stale data on failure
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchEvents();
    const id = setInterval(fetchEvents, POLL_INTERVAL);
    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, [fetchEvents]);

  // Also re-fetch when we receive a CALENDAR_UPDATED WebSocket event
  useEffect(() => {
    const handler = () => { fetchEvents(); };
    window.addEventListener('mirror:calendar_updated', handler);
    return () => window.removeEventListener('mirror:calendar_updated', handler);
  }, [fetchEvents]);

  return { events, hasProviders, loading };
}
