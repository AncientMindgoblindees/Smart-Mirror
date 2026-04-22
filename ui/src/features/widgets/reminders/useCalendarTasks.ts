import { getCalendarTasks } from '@/api/mirrorApi';
import type { CalendarTasksResponse } from '@/api/backendTypes';
import { toReminderDisplay, type ReminderDisplay } from '@/api/transforms/calendar';
import { useCalendarFeed } from '../calendar/useCalendarFeed';

export function useCalendarTasks(): {
  tasks: ReminderDisplay[];
  hasProviders: boolean;
  loading: boolean;
} {
  const { items, hasProviders, loading } = useCalendarFeed<CalendarTasksResponse, ReminderDisplay>({
    fetcher: (signal) => getCalendarTasks(undefined, { signal }),
    mapItems: (resp) => resp.tasks.map(toReminderDisplay),
  });
  return { tasks: items, hasProviders, loading };
}

export type { ReminderDisplay };
