import { useState } from 'react';

import { getEmailMessages } from '@/api/mirrorApi';
import type { EmailMessageItem, EmailMessagesResponse } from '@/api/backendTypes';
import { usePollingQuery } from '@/hooks/infra/usePollingQuery';

export type EmailDisplay = {
  sender: string;
  subject: string;
  source: string;
  unread: boolean;
  highPriority: boolean;
  receivedLabel: string;
};

function formatReceivedLabel(value?: string | null): string {
  if (!value) return '';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '';
  const now = new Date();
  const sameDay = dt.toDateString() === now.toDateString();
  if (sameDay) {
    return dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  return dt.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

function mapItem(item: EmailMessageItem): EmailDisplay {
  return {
    sender: item.sender || 'Unknown sender',
    subject: item.subject || '(no subject)',
    source: item.source,
    unread: item.unread,
    highPriority: item.high_priority,
    receivedLabel: formatReceivedLabel(item.received_at),
  };
}

export function useEmailMessages(): {
  messages: EmailDisplay[];
  hasProviders: boolean;
  loading: boolean;
} {
  const [messages, setMessages] = useState<EmailDisplay[]>([]);
  const [hasProviders, setHasProviders] = useState(false);
  const { loading } = usePollingQuery<EmailMessagesResponse>({
    fetcher: () => getEmailMessages({ limit: 24 }),
    pollMs: 30_000,
    refreshEventName: 'mirror:auth_state_changed',
    onData: (resp) => {
      setMessages(resp.messages.map(mapItem));
      setHasProviders(resp.providers.length > 0);
    },
    onError: () => {
      // Keep stale data until next successful poll.
    },
  });

  return { messages, hasProviders, loading };
}
