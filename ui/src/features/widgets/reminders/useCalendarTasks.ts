import { useCallback, useEffect, useRef, useState } from 'react';
import { getCalendarTasks } from '@/api/mirrorApi';
import type { CalendarEventItem } from '@/api/backendTypes';

const POLL_INTERVAL = 60_000;

export type ReminderDisplay = {
  text: string;
  done: boolean;
  source?: string;
};

function toDisplay(item: CalendarEventItem): ReminderDisplay {
  return {
    text: item.title,
    done: item.completed,
    source: item.source,
  };
}

export function useCalendarTasks(): {
  tasks: ReminderDisplay[];
  hasProviders: boolean;
  loading: boolean;
} {
  const [tasks, setTasks] = useState<ReminderDisplay[]>([]);
  const [hasProviders, setHasProviders] = useState(false);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  const fetchTasks = useCallback(async () => {
    try {
      const resp = await getCalendarTasks();
      if (!mountedRef.current) return;
      setTasks(resp.tasks.map(toDisplay));
      setHasProviders(resp.providers.length > 0);
    } catch {
      // keep stale data on failure
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchTasks();
    const id = setInterval(fetchTasks, POLL_INTERVAL);
    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, [fetchTasks]);

  useEffect(() => {
    const handler = () => { fetchTasks(); };
    window.addEventListener('mirror:calendar_updated', handler);
    return () => window.removeEventListener('mirror:calendar_updated', handler);
  }, [fetchTasks]);

  return { tasks, hasProviders, loading };
}
