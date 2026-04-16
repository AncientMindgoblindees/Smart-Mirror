import type { CalendarEventItem } from '@/api/backendTypes';

export type CalendarEventDisplay = {
  time: string;
  event: string;
  allDay: boolean;
  source: string;
};

export type ReminderDisplay = {
  text: string;
  done: boolean;
  source?: string;
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

export function toCalendarEventDisplay(item: CalendarEventItem): CalendarEventDisplay {
  return {
    time: formatTime(item.start_time, item.all_day),
    event: item.title,
    allDay: item.all_day,
    source: item.source,
  };
}

export function toReminderDisplay(item: CalendarEventItem): ReminderDisplay {
  return {
    text: item.title,
    done: item.completed,
    source: item.source,
  };
}
