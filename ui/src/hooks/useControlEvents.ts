import { useEffect } from 'react';

type ControlEventHandlers = {
  onCameraCountdownStarted?: (countdownSeconds: number) => void;
  onCameraCountdownTick?: (remaining: number) => void;
  onCameraCaptured?: () => void;
  onCameraError?: (message: string) => void;
};

function readNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return fallback;
}

export function useControlEvents(handlers: ControlEventHandlers): void {
  useEffect(() => {
    const wsUrl = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws/control`;
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
          const data = JSON.parse(ev.data as string) as {
            type?: string;
            payload?: Record<string, unknown>;
          };
          const payload = data.payload ?? {};
          switch (data.type) {
            case 'CAMERA_COUNTDOWN_STARTED':
              handlers.onCameraCountdownStarted?.(
                readNumber(payload.countdown_seconds, 3)
              );
              break;
            case 'CAMERA_COUNTDOWN_TICK':
              handlers.onCameraCountdownTick?.(readNumber(payload.remaining, 0));
              break;
            case 'CAMERA_CAPTURED':
              handlers.onCameraCaptured?.();
              break;
            case 'CAMERA_ERROR':
              handlers.onCameraError?.(String(payload.message ?? 'Camera error'));
              break;
            default:
              break;
          }
        } catch {
          // ignore malformed payloads
        }
      };

      ws.onclose = () => {
        if (!closed) reconnectTimer = setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        try {
          ws?.close();
        } catch {
          // ignore
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
        // ignore
      }
    };
  }, [handlers]);
}
