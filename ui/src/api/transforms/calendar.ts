import type { CalendarEventItem } from '@/api/backendTypes';

export type CalendarEventDisplay = {
  time: string;
  event: string;
  allDay: boolean;
  source: string;
  dayLabel: string;
  timeLabel: string;
  detailLabel: string;
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

function formatDayLabel(iso: string | null | undefined): string {
  if (!iso) return 'Upcoming';
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return 'Upcoming';
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTarget = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  const dayDiff = Math.round((startOfTarget.getTime() - startOfToday.getTime()) / 86_400_000);
  if (dayDiff === 0) return 'Today';
  if (dayDiff === 1) return 'Tomorrow';
  return target.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatTimeRange(
  startIso: string | null | undefined,
  endIso: string | null | undefined,
  allDay: boolean,
): string {
  if (allDay) return 'All day';
  const start = formatTime(startIso, false);
  const end = formatTime(endIso, false);
  if (start && end) return `${start} - ${end}`;
  return start || end || 'Time TBD';
}

function formatDetailLabel(item: CalendarEventItem): string {
  const location = typeof item.metadata?.location === 'string' ? item.metadata.location.trim() : '';
  const source = item.source ? item.source[0].toUpperCase() + item.source.slice(1) : 'Calendar';
  if (location) return `${source} - ${location}`;
  return source;
}

export function toCalendarEventDisplay(item: CalendarEventItem): CalendarEventDisplay {
  const timeLabel = formatTimeRange(item.start_time, item.end_time, item.all_day);
  return {
    time: formatTime(item.start_time, item.all_day),
    event: item.title,
    allDay: item.all_day,
    source: item.source,
    dayLabel: formatDayLabel(item.start_time),
    timeLabel,
    detailLabel: formatDetailLabel(item),
  };
}

export function toReminderDisplay(item: CalendarEventItem): ReminderDisplay {
  return {
    text: item.title,
    done: item.completed,
    source: item.source,
  };
}
