import { useEffect, useRef } from 'react';

export type DeviceEventPayload = {
  deviceId: string | null;
  displayName: string | null;
  message?: string;
  code?: string | null;
  reason?: string | null;
  initiator?: string;
};

export type AuthStatePayload = {
  provider: string;
  status: string;
  message?: string;
};

export type CalendarUpdatedPayload = {
  provider: string;
  events_count: number;
  tasks_count: number;
  synced_at: string;
};

type ControlEventHandlers = {
  onCameraCountdownStarted?: (countdownSeconds: number) => void;
  onCameraCountdownTick?: (remaining: number) => void;
  onCameraCaptured?: () => void;
  onCameraError?: (message: string) => void;

  onDeviceSearching?: (payload: DeviceEventPayload) => void;
  onDeviceConnecting?: (payload: DeviceEventPayload) => void;
  onDeviceConnected?: (payload: DeviceEventPayload) => void;
  onDeviceDisconnecting?: (payload: DeviceEventPayload) => void;
  onDeviceDisconnected?: (payload: DeviceEventPayload) => void;
  onDeviceError?: (payload: DeviceEventPayload) => void;

  onAuthStateChanged?: (payload: AuthStatePayload) => void;
  onCalendarUpdated?: (payload: CalendarUpdatedPayload) => void;
};

function readNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return fallback;
}

function parseDevicePayload(raw: Record<string, unknown>): DeviceEventPayload {
  return {
    deviceId: typeof raw.device_id === 'string' ? raw.device_id : null,
    displayName: typeof raw.display_name === 'string' ? raw.display_name : null,
    message: typeof raw.message === 'string' ? raw.message : undefined,
    code: typeof raw.code === 'string' ? raw.code : null,
    reason: typeof raw.reason === 'string' ? raw.reason : null,
    initiator: typeof raw.initiator === 'string' ? raw.initiator : undefined,
  };
}

const BACKOFF_INITIAL = 1000;
const BACKOFF_MAX = 30_000;

export function useControlEvents(handlers: ControlEventHandlers): void {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    const wsUrl = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws/control`;
    let ws: WebSocket | null = null;
    let closed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
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
          const data = JSON.parse(ev.data as string) as {
            type?: string;
            payload?: Record<string, unknown>;
          };
          const payload = data.payload ?? {};
          switch (data.type) {
            case 'CAMERA_COUNTDOWN_STARTED':
              ref.current.onCameraCountdownStarted?.(
                readNumber(payload.countdown_seconds, 3)
              );
              break;
            case 'CAMERA_COUNTDOWN_TICK':
              ref.current.onCameraCountdownTick?.(readNumber(payload.remaining, 0));
              break;
            case 'CAMERA_CAPTURED':
              ref.current.onCameraCaptured?.();
              break;
            case 'CAMERA_ERROR':
              ref.current.onCameraError?.(String(payload.message ?? 'Camera error'));
              break;
            case 'DEVICE_SEARCHING':
              ref.current.onDeviceSearching?.(parseDevicePayload(payload));
              break;
            case 'DEVICE_CONNECTING':
              ref.current.onDeviceConnecting?.(parseDevicePayload(payload));
              break;
            case 'DEVICE_CONNECTED':
              ref.current.onDeviceConnected?.(parseDevicePayload(payload));
              break;
            case 'DEVICE_DISCONNECTING':
              ref.current.onDeviceDisconnecting?.(parseDevicePayload(payload));
              break;
            case 'DEVICE_DISCONNECTED':
              ref.current.onDeviceDisconnected?.(parseDevicePayload(payload));
              break;
            case 'DEVICE_ERROR':
              ref.current.onDeviceError?.(parseDevicePayload(payload));
              break;
            case 'AUTH_STATE_CHANGED':
              ref.current.onAuthStateChanged?.({
                provider: String(payload.provider ?? ''),
                status: String(payload.status ?? ''),
                message: typeof payload.message === 'string' ? payload.message : undefined,
              });
              window.dispatchEvent(new CustomEvent('mirror:auth_state_changed', { detail: payload }));
              break;
            case 'CALENDAR_UPDATED':
              ref.current.onCalendarUpdated?.({
                provider: String(payload.provider ?? ''),
                events_count: typeof payload.events_count === 'number' ? payload.events_count : 0,
                tasks_count: typeof payload.tasks_count === 'number' ? payload.tasks_count : 0,
                synced_at: String(payload.synced_at ?? ''),
              });
              window.dispatchEvent(new CustomEvent('mirror:calendar_updated', { detail: payload }));
              break;
            default:
              break;
          }
        } catch {
          // ignore malformed payloads
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
  }, []);
}
