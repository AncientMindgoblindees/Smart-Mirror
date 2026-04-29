import type {
  AuthLoginStatus,
  AuthProviderStatus,
  CalendarEventsResponse,
  EmailMessagesResponse,
  CalendarTasksResponse,
  CameraCaptureRequest,
  CameraStatusOut,
  DeviceCodeResponse,
  UserSettingsOut,
  UserSettingsUpdate,
  WeatherSnapshotOut,
  WidgetConfigOut,
  WidgetConfigUpdate,
  ClothingItemRead,
  ClothingItemUpdate,
  OutfitGenerateRequest,
  OutfitGenerateResponse,
  PersonImageRead,
} from './backendTypes';
import { getApiBase, getApiToken } from '@/config/backendOrigin';
import { withQuery } from './endpoints';
import { jsonRequest } from './httpClient';

export function getWidgets(): Promise<WidgetConfigOut[]> {
  return jsonRequest<WidgetConfigOut[]>('/widgets/');
}

export function putWidgets(configs: WidgetConfigUpdate[]): Promise<WidgetConfigOut[]> {
  return jsonRequest<WidgetConfigOut[]>('/widgets/', {
    method: 'PUT',
    body: JSON.stringify(configs),
  });
}

export function getUserSettings(): Promise<UserSettingsOut> {
  return jsonRequest<UserSettingsOut>('/user/settings');
}

export function putUserSettings(updates: UserSettingsUpdate): Promise<UserSettingsOut> {
  return jsonRequest<UserSettingsOut>('/user/settings', {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

export function getCameraStatus(): Promise<CameraStatusOut> {
  return jsonRequest<CameraStatusOut>('/camera/status');
}

export function getWeather(opts?: {
  q?: string;
  units?: 'metric' | 'imperial';
}): Promise<WeatherSnapshotOut> {
  return jsonRequest<WeatherSnapshotOut>(withQuery('/weather/', { q: opts?.q, units: opts?.units }));
}

export function getClothingItems(opts?: {
  includeImages?: boolean;
  favoriteOnly?: boolean;
}): Promise<ClothingItemRead[]> {
  return jsonRequest<ClothingItemRead[]>(
    withQuery('/clothing/', {
      include_images: opts?.includeImages ? 1 : undefined,
      favorite_only: opts?.favoriteOnly ? 1 : undefined,
    }),
  );
}

export function updateClothingItem(itemId: number, updates: ClothingItemUpdate): Promise<ClothingItemRead> {
  return jsonRequest<ClothingItemRead>(`/clothing/${itemId}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

export function generateOutfitTryOn(payload: OutfitGenerateRequest): Promise<OutfitGenerateResponse> {
  return jsonRequest<OutfitGenerateResponse>('/tryon/outfit-generate', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getPersonImages(): Promise<PersonImageRead[]> {
  return jsonRequest<PersonImageRead[]>('/tryon/person-image');
}

export async function uploadPersonImage(file: Blob, filename = 'webcam-capture.jpg'): Promise<PersonImageRead> {
  const form = new FormData();
  form.append('file', file, filename);
  const token = getApiToken();
  const res = await fetch(`${getApiBase()}/tryon/person-image`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: form,
  });
  if (!res.ok) {
    throw new Error(`Upload failed: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<PersonImageRead>;
}

export function triggerCameraCapture(req: CameraCaptureRequest): Promise<{ status: string }> {
  return jsonRequest<{ status: string }>('/camera/capture', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

// ── Auth ────────────────────────────────────────────────────────────

export function getAuthProviders(): Promise<AuthProviderStatus[]> {
  return jsonRequest<AuthProviderStatus[]>('/auth/providers');
}

export function startLogin(provider: string): Promise<DeviceCodeResponse> {
  return jsonRequest<DeviceCodeResponse>(`/auth/login/${provider}`, { method: 'POST' });
}

export function getLoginStatus(provider: string): Promise<AuthLoginStatus> {
  return jsonRequest<AuthLoginStatus>(`/auth/login/${provider}/status`);
}

export function logoutProvider(provider: string): Promise<{ status: string }> {
  return jsonRequest<{ status: string }>(`/auth/logout/${provider}`, { method: 'DELETE' });
}

export function cancelLogin(provider: string): Promise<{ status: string }> {
  return jsonRequest<{ status: string }>(`/auth/login/${provider}/cancel`, { method: 'POST' });
}

// ── Calendar ────────────────────────────────────────────────────────

export function getCalendarEvents(opts?: {
  days?: number;
  provider?: string;
}): Promise<CalendarEventsResponse> {
  return jsonRequest<CalendarEventsResponse>(
    withQuery('/calendar/events', { days: opts?.days, provider: opts?.provider }),
  );
}

export function getCalendarTasks(opts?: {
  provider?: string;
}): Promise<CalendarTasksResponse> {
  return jsonRequest<CalendarTasksResponse>(
    withQuery('/calendar/tasks', { provider: opts?.provider }),
  );
}

export function getEmailMessages(opts?: {
  provider?: string;
  limit?: number;
}): Promise<EmailMessagesResponse> {
  return jsonRequest<EmailMessagesResponse>(
    withQuery('/email/messages', { provider: opts?.provider, limit: opts?.limit }),
  );
}
