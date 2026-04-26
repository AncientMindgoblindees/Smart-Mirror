import { useEffect, useRef } from 'react';

import { getWebSocketUrl } from '@/config/backendOrigin';

/**
 * Keyboard (dev / kiosk testing) + WebSocket `/ws/buttons` (physical GPIO buttons).
 *
 * Keys (when focus is not in an input):
 * - d: toggle tools / dev panel
 * - 2: toggle dim (matches GPIO DISPLAY click → toggle_dim)
 * - 3: toggle screen off / sleep (matches GPIO DISPLAY long-press → toggle_sleep)
 *
 * When sleep is on, the next key press wakes the mirror (no other action).
 */
export type MirrorInputActions = {
  toggleDim: () => void;
  toggleSleep: () => void;
  toggleDevPanel: () => void;
  dismissTryOnOverlay: () => void;
  getSleepMode: () => boolean;
  isInputBlocked?: () => boolean;
};

export function useMirrorInput(actions: MirrorInputActions) {
  const ref = useRef(actions);
  ref.current = actions;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (ref.current.isInputBlocked?.()) return;

      if (ref.current.getSleepMode()) {
        e.preventDefault();
        ref.current.toggleSleep();
        return;
      }

      const k = e.key;
      if (k === 'd' || k === 'D') {
        e.preventDefault();
        ref.current.toggleDevPanel();
        return;
      }
      if (k === '2') {
        e.preventDefault();
        ref.current.toggleDim();
        return;
      }
      if (k === '3') {
        e.preventDefault();
        ref.current.toggleSleep();
        return;
      }
      if (k === 'x' || k === 'X') {
        e.preventDefault();
        ref.current.dismissTryOnOverlay();
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const wsUrl = getWebSocketUrl('/ws/buttons');
    let ws: WebSocket | null = null;
    let closed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    const BACKOFF_INITIAL = 1000;
    const BACKOFF_MAX = 30_000;
    let backoff = BACKOFF_INITIAL;

    const connect = () => {
      if (closed) return;
      try {
        ws = new WebSocket(wsUrl);
      } catch {
        reconnectTimer = setTimeout(connect, backoff);
        backoff = Math.min(backoff * 2, BACKOFF_MAX);
        return;
      }

      ws.onopen = () => {
        backoff = BACKOFF_INITIAL;
      };

      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data as string) as { effect?: string };
          switch (data.effect) {
            case 'toggle_dim':
              ref.current.toggleDim();
              break;
            case 'toggle_sleep':
              ref.current.toggleSleep();
              break;
            case 'dismiss_tryon':
              ref.current.dismissTryOnOverlay();
              break;
            default:
              break;
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
      if (reconnectTimer) clearTimeout(reconnectTimer);
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
    };
  }, []);
}
