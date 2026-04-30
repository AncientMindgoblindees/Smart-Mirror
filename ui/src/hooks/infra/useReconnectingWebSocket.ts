import { useEffect, useRef } from 'react';

type UseReconnectingWebSocketOpts = {
  onMessage: (ev: MessageEvent<string>) => void;
  initialBackoffMs?: number;
  maxBackoffMs?: number;
};

export function useReconnectingWebSocket(url: string, opts: UseReconnectingWebSocketOpts): void {
  const onMessageRef = useRef(opts.onMessage);
  onMessageRef.current = opts.onMessage;

  useEffect(() => {
    const initialBackoff = opts.initialBackoffMs ?? 1000;
    const maxBackoff = opts.maxBackoffMs ?? 30_000;
    let ws: WebSocket | null = null;
    let closed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let backoff = initialBackoff;

    const connect = () => {
      if (closed) return;
      try {
        ws = new WebSocket(url);
      } catch {
        reconnectTimer = setTimeout(connect, backoff);
        backoff = Math.min(backoff * 2, maxBackoff);
        return;
      }

      ws.onopen = () => {
        backoff = initialBackoff;
      };
      ws.onmessage = (ev) => onMessageRef.current(ev as MessageEvent<string>);
      ws.onclose = () => {
        if (!closed) {
          reconnectTimer = setTimeout(connect, backoff);
          backoff = Math.min(backoff * 2, maxBackoff);
        }
      };
      ws.onerror = () => {
        try {
          ws?.close();
        } catch {
          /* ignore */
        }
      };
    };

    connect();
    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
    };
  }, [url, opts.initialBackoffMs, opts.maxBackoffMs]);
}
