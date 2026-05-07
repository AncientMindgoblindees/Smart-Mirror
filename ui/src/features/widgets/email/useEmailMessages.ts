import { useEffect, useRef, useState } from 'react';

import { getEmailMessages } from '@/api/mirrorApi';
import type { EmailMessageItem, EmailMessagesResponse } from '@/api/backendTypes';
import { usePollingQuery } from '@/hooks/infra/usePollingQuery';
import type { EmailViewMode } from '../types';

export type EmailDisplay = {
  sender: string;
  subject: string;
  source: string;
  unread: boolean;
  highPriority: boolean;
  receivedLabel: string;
};

type EmailTimeFormat = '12h' | '24h';

function formatReceivedLabel(value?: string | null, timeFormat: EmailTimeFormat = '24h'): string {
  if (!value) return '';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '';
  const now = new Date();
  const sameDay = dt.toDateString() === now.toDateString();
  if (sameDay) {
    return dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: timeFormat === '12h' });
  }
  return dt.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

function mapItem(item: EmailMessageItem, timeFormat: EmailTimeFormat): EmailDisplay {
  return {
    sender: item.sender || 'Unknown sender',
    subject: item.subject || '(no subject)',
    source: item.source,
    unread: item.unread,
    highPriority: item.high_priority,
    receivedLabel: formatReceivedLabel(item.received_at, timeFormat),
  };
}

export function useEmailMessages(opts: {
  limit?: number;
  mode?: EmailViewMode;
  timeFormat?: EmailTimeFormat;
} = {}): {
  messages: EmailDisplay[];
  hasProviders: boolean;
  loading: boolean;
} {
  const [messages, setMessages] = useState<EmailDisplay[]>([]);
  const [hasProviders, setHasProviders] = useState(false);
  const mode = opts.mode ?? 'unread_or_high';
  const limit = opts.limit ?? 24;
  const timeFormat = opts.timeFormat ?? '24h';
  const refreshKey = `${limit}:${mode}:${timeFormat}`;
  const { loading, refresh } = usePollingQuery<EmailMessagesResponse>({
    fetcher: () => getEmailMessages({ limit, mode }),
    pollMs: 30_000,
    refreshEventName: 'mirror:auth_state_changed',
    onData: (resp) => {
      setMessages(resp.messages.map((item) => mapItem(item, timeFormat)));
      setHasProviders(resp.providers.length > 0);
    },
    onError: () => {
      // Keep stale data until next successful poll.
    },
  });
  const previousRefreshKey = useRef(refreshKey);
  useEffect(() => {
    if (previousRefreshKey.current === refreshKey) return;
    previousRefreshKey.current = refreshKey;
    refresh();
  }, [refresh, refreshKey]);

  return { messages, hasProviders, loading };
}
