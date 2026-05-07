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

export type TryOnResultPayload = {
  generation_id: string;
  image_url: string;
};

export type UserSettingsPayload = {
  id: number;
  theme: string;
  primary_font_size: number;
  accent_color: string;
  created_at: string;
  updated_at: string;
};

export type ParsedControlEvent =
  | { type: 'CAMERA_LOADING_STARTED' }
  | { type: 'CAMERA_LOADING_READY' }
  | { type: 'CAMERA_COUNTDOWN_STARTED'; countdownSeconds: number }
  | { type: 'CAMERA_COUNTDOWN_TICK'; remaining: number }
  | { type: 'CAMERA_CAPTURED' }
  | { type: 'CAMERA_ERROR'; message: string }
  | { type: 'DEVICE_SEARCHING' | 'DEVICE_CONNECTING' | 'DEVICE_CONNECTED' | 'DEVICE_DISCONNECTING' | 'DEVICE_DISCONNECTED' | 'DEVICE_ERROR'; payload: DeviceEventPayload }
  | { type: 'OAUTH_DEVICE_CODE'; payload: Record<string, unknown> }
  | { type: 'AUTH_STATE_CHANGED'; payload: AuthStatePayload; rawPayload: Record<string, unknown> }
  | { type: 'CALENDAR_UPDATED'; payload: CalendarUpdatedPayload; rawPayload: Record<string, unknown> }
  | { type: 'TRYON_RESULT'; payload: TryOnResultPayload }
  | { type: 'USER_SETTINGS_UPDATED'; payload: UserSettingsPayload; rawPayload: Record<string, unknown> }
  | { type: 'UNKNOWN' };

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

export function parseControlEvent(rawText: string): ParsedControlEvent {
  try {
    const data = JSON.parse(rawText) as { type?: string; payload?: Record<string, unknown> };
    const payload = data.payload ?? {};
    switch (data.type) {
      case 'CAMERA_LOADING_STARTED':
        return { type: 'CAMERA_LOADING_STARTED' };
      case 'CAMERA_LOADING_READY':
        return { type: 'CAMERA_LOADING_READY' };
      case 'CAMERA_COUNTDOWN_STARTED':
        return { type: 'CAMERA_COUNTDOWN_STARTED', countdownSeconds: readNumber(payload.countdown_seconds, 3) };
      case 'CAMERA_COUNTDOWN_TICK':
        return { type: 'CAMERA_COUNTDOWN_TICK', remaining: readNumber(payload.remaining, 0) };
      case 'CAMERA_CAPTURED':
        return { type: 'CAMERA_CAPTURED' };
      case 'CAMERA_ERROR':
        return { type: 'CAMERA_ERROR', message: String(payload.message ?? 'Camera error') };
      case 'DEVICE_SEARCHING':
      case 'DEVICE_CONNECTING':
      case 'DEVICE_CONNECTED':
      case 'DEVICE_DISCONNECTING':
      case 'DEVICE_DISCONNECTED':
      case 'DEVICE_ERROR':
        return { type: data.type, payload: parseDevicePayload(payload) };
      case 'OAUTH_DEVICE_CODE':
        return { type: 'OAUTH_DEVICE_CODE', payload };
      case 'AUTH_STATE_CHANGED':
        return {
          type: 'AUTH_STATE_CHANGED',
          payload: {
            provider: String(payload.provider ?? ''),
            status: String(payload.status ?? ''),
            message: typeof payload.message === 'string' ? payload.message : undefined,
          },
          rawPayload: payload,
        };
      case 'CALENDAR_UPDATED':
        return {
          type: 'CALENDAR_UPDATED',
          payload: {
            provider: String(payload.provider ?? ''),
            events_count: typeof payload.events_count === 'number' ? payload.events_count : 0,
            tasks_count: typeof payload.tasks_count === 'number' ? payload.tasks_count : 0,
            synced_at: String(payload.synced_at ?? ''),
          },
          rawPayload: payload,
        };
      case 'TRYON_RESULT':
        return {
          type: 'TRYON_RESULT',
          payload: {
            generation_id: String(payload.generation_id ?? ''),
            image_url: String(payload.image_url ?? ''),
          },
        };
      case 'USER_SETTINGS_UPDATED': {
        const rawSettings = payload.settings;
        const settings = rawSettings && typeof rawSettings === 'object'
          ? rawSettings as Record<string, unknown>
          : payload;
        return {
          type: 'USER_SETTINGS_UPDATED',
          payload: {
            id: readNumber(settings.id, 0),
            theme: String(settings.theme ?? 'dark'),
            primary_font_size: readNumber(settings.primary_font_size, 72),
            accent_color: String(settings.accent_color ?? '#4a9eff'),
            created_at: String(settings.created_at ?? ''),
            updated_at: String(settings.updated_at ?? ''),
          },
          rawPayload: payload,
        };
      }
      default:
        return { type: 'UNKNOWN' };
    }
  } catch {
    return { type: 'UNKNOWN' };
  }
}
