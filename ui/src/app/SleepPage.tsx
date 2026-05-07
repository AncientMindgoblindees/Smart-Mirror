import { useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { getWebSocketUrl } from '@/config/backendOrigin';
import './mirror-app.css';

const WAKE_EFFECTS = new Set(['menu_up', 'menu_down', 'menu_select']);

export function SleepPage() {
  const navigate = useNavigate();

  const wake = useCallback(() => {
    navigate('/', { replace: true });
  }, [navigate]);

  useEffect(() => {
    document.body.classList.add('mirror-sleep');
    return () => {
      document.body.classList.remove('mirror-sleep');
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'Enter') {
        event.preventDefault();
        wake();
      }
    };

    window.addEventListener('keydown', onKeyDown);

    let ws: WebSocket | null = null;
    let closed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let backoff = 1000;
    const BACKOFF_MAX = 30_000;

    const connect = () => {
      if (closed) return;
      try {
        ws = new WebSocket(getWebSocketUrl('/ws/buttons'));
      } catch {
        reconnectTimer = setTimeout(connect, backoff);
        backoff = Math.min(backoff * 2, BACKOFF_MAX);
        return;
      }

      ws.onopen = () => {
        backoff = 1000;
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string) as { effect?: string };
          if (data.effect && WAKE_EFFECTS.has(data.effect)) {
            wake();
          }
        } catch {
          /* ignore */
        }
      };

      ws.onclose = () => {
        if (!closed) {
          reconnectTimer = setTimeout(connect, backoff);
          backoff = Math.min(backoff * 2, BACKOFF_MAX);
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
      window.removeEventListener('keydown', onKeyDown);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
    };
  }, [wake]);

  return (
    <main className="sleep-page" aria-label="Mirror sleep screen">
      <div className="sleep-page__hint">Sleep - tap or press any key to wake</div>
    </main>
  );
}
