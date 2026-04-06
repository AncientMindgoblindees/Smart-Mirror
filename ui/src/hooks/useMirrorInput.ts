import { useEffect, useRef } from 'react';

/**
 * Keyboard (dev / kiosk testing) + WebSocket `/ws/buttons` (physical GPIO buttons).
 *
 * Keys (when focus is not in an input):
 * - d: toggle tools / dev panel
 * - 1: cycle layout (matches GPIO LAYOUT click → cycle_layout)
 * - 2: toggle dim (matches GPIO DISPLAY click → toggle_dim)
 * - 3: toggle screen off / sleep (matches GPIO DISPLAY long-press → toggle_sleep)
 *
 * When sleep is on, the next key press wakes the mirror (no other action).
 */
export type MirrorInputActions = {
  cycleLayout: () => void;
  toggleDim: () => void;
  toggleSleep: () => void;
  toggleDevPanel: () => void;
  getSleepMode: () => boolean;
};

export function useMirrorInput(actions: MirrorInputActions) {
  const ref = useRef(actions);
  ref.current = actions;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest('input, textarea, select, [contenteditable="true"]')) return;

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
      if (k === '1') {
        e.preventDefault();
        ref.current.cycleLayout();
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
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const wsUrl = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws/buttons`;
    let ws: WebSocket | null = null;
    let closed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      if (closed) return;
      try {
        ws = new WebSocket(wsUrl);
      } catch {
        reconnectTimer = setTimeout(connect, 3000);
        return;
      }

      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data as string) as { effect?: string };
          switch (data.effect) {
            case 'cycle_layout':
              ref.current.cycleLayout();
              break;
            case 'toggle_dim':
              ref.current.toggleDim();
              break;
            case 'toggle_sleep':
              ref.current.toggleSleep();
              break;
            default:
              break;
          }
        } catch {
          /* ignore */
        }
      };

      ws.onclose = () => {
        if (!closed) reconnectTimer = setTimeout(connect, 3000);
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
