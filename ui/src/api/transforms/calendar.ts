import type { CalendarEventItem } from '@/api/backendTypes';

export type CalendarEventDisplay = {
  time: string;
  event: string;
  allDay: boolean;
  source: string;
  dayLabel: string;
  timeLabel: string;
  detailLabel: string;
  startMs: number | null;
};

export type ReminderDisplay = {
  text: string;
  done: boolean;
  source?: string;
};

export type CalendarTimeFormat = '12h' | '24h';

function parseStartMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  const ms = d.getTime();
  return Number.isNaN(ms) ? null : ms;
}

function formatTime(
  iso: string | null | undefined,
  allDay: boolean,
  timeFormat: CalendarTimeFormat,
): string {
  if (allDay || !iso) return 'All day';
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: timeFormat === '12h' });
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
  timeFormat: CalendarTimeFormat,
): string {
  if (allDay) return 'All day';
  const start = formatTime(startIso, false, timeFormat);
  const end = formatTime(endIso, false, timeFormat);
  if (start && end) return `${start} - ${end}`;
  return start || end || 'Time TBD';
}

function formatDetailLabel(item: CalendarEventItem): string {
  const location = typeof item.metadata?.location === 'string' ? item.metadata.location.trim() : '';
  const source = item.source ? item.source[0].toUpperCase() + item.source.slice(1) : 'Calendar';
  if (location) return `${source} - ${location}`;
  return source;
}

export function toCalendarEventDisplay(
  item: CalendarEventItem,
  timeFormat: CalendarTimeFormat = '24h',
): CalendarEventDisplay {
  const timeLabel = formatTimeRange(item.start_time, item.end_time, item.all_day, timeFormat);
  return {
    time: formatTime(item.start_time, item.all_day, timeFormat),
    event: item.title,
    allDay: item.all_day,
    source: item.source,
    dayLabel: formatDayLabel(item.start_time),
    timeLabel,
    detailLabel: formatDetailLabel(item),
    startMs: parseStartMs(item.start_time),
  };
}

export function toReminderDisplay(item: CalendarEventItem): ReminderDisplay {
  return {
    text: item.title,
    done: item.completed,
    source: item.source,
  };
}
