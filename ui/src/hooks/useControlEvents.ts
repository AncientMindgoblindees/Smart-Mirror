import { useRef } from 'react';

import { getWebSocketUrl } from '@/config/backendOrigin';
import { useReconnectingWebSocket } from '@/hooks/infra/useReconnectingWebSocket';
import { withApiTokenIfProtectedMedia } from '@/api/authMediaUrl';
import {
  type AuthStatePayload,
  type CalendarUpdatedPayload,
  type DeviceEventPayload,
  type TryOnResultPayload,
  parseControlEvent,
} from './controlEventProtocol';

export type {
  DeviceEventPayload,
  AuthStatePayload,
  CalendarUpdatedPayload,
  TryOnResultPayload,
} from './controlEventProtocol';

type ControlEventHandlers = {
  onCameraLoadingStarted?: () => void;
  onCameraLoadingReady?: () => void;
  onCameraCountdownStarted?: (countdownSeconds: number) => void;
  onCameraCountdownTick?: (remaining: number) => void;
  onCameraCaptured?: () => void;
  onCameraError?: (message: string) => void;
  onTryOnResult?: (payload: TryOnResultPayload) => void;

  onDeviceSearching?: (payload: DeviceEventPayload) => void;
  onDeviceConnecting?: (payload: DeviceEventPayload) => void;
  onDeviceConnected?: (payload: DeviceEventPayload) => void;
  onDeviceDisconnecting?: (payload: DeviceEventPayload) => void;
  onDeviceDisconnected?: (payload: DeviceEventPayload) => void;
  onDeviceError?: (payload: DeviceEventPayload) => void;

  onAuthStateChanged?: (payload: AuthStatePayload) => void;
  onCalendarUpdated?: (payload: CalendarUpdatedPayload) => void;
};

export function useControlEvents(handlers: ControlEventHandlers): void {
  const ref = useRef(handlers);
  ref.current = handlers;
  const wsUrl = getWebSocketUrl('/ws/control');
  useReconnectingWebSocket(wsUrl, {
    onMessage: (ev) => {
      const applyRaw = (rawText: string) => {
        const parsed = parseControlEvent(rawText);
        switch (parsed.type) {
        case 'CAMERA_LOADING_STARTED':
          ref.current.onCameraLoadingStarted?.();
          break;
        case 'CAMERA_LOADING_READY':
          ref.current.onCameraLoadingReady?.();
          break;
        case 'CAMERA_COUNTDOWN_STARTED':
          ref.current.onCameraCountdownStarted?.(parsed.countdownSeconds);
          break;
        case 'CAMERA_COUNTDOWN_TICK':
          ref.current.onCameraCountdownTick?.(parsed.remaining);
          break;
        case 'CAMERA_CAPTURED':
          ref.current.onCameraCaptured?.();
          break;
        case 'CAMERA_ERROR':
          ref.current.onCameraError?.(parsed.message);
          break;
        case 'DEVICE_SEARCHING':
          ref.current.onDeviceSearching?.(parsed.payload);
          break;
        case 'DEVICE_CONNECTING':
          ref.current.onDeviceConnecting?.(parsed.payload);
          break;
        case 'DEVICE_CONNECTED':
          ref.current.onDeviceConnected?.(parsed.payload);
          break;
        case 'DEVICE_DISCONNECTING':
          ref.current.onDeviceDisconnecting?.(parsed.payload);
          break;
        case 'DEVICE_DISCONNECTED':
          ref.current.onDeviceDisconnected?.(parsed.payload);
          break;
        case 'DEVICE_ERROR':
          ref.current.onDeviceError?.(parsed.payload);
          break;
        case 'OAUTH_DEVICE_CODE':
          window.dispatchEvent(new CustomEvent('mirror:oauth_device_code', { detail: parsed.payload }));
          break;
        case 'AUTH_STATE_CHANGED':
          ref.current.onAuthStateChanged?.(parsed.payload);
          window.dispatchEvent(new CustomEvent('mirror:auth_state_changed', { detail: parsed.rawPayload }));
          break;
        case 'CALENDAR_UPDATED':
          ref.current.onCalendarUpdated?.(parsed.payload);
          window.dispatchEvent(new CustomEvent('mirror:calendar_updated', { detail: parsed.rawPayload }));
          break;
        case 'TRYON_RESULT':
          {
            const payload = {
              ...parsed.payload,
              image_url: withApiTokenIfProtectedMedia(parsed.payload.image_url),
            };
            ref.current.onTryOnResult?.(payload);
            window.dispatchEvent(new CustomEvent('mirror:tryon_result', { detail: payload }));
          }
          break;
        default:
          break;
      }
      };

      const data = ev.data as string | Blob;
      if (typeof data === 'string') {
        applyRaw(data);
      } else if (data instanceof Blob) {
        void data.text().then(applyRaw);
      }
    },
  });
}
