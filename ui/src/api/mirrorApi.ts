import type {
  AuthLoginStatus,
  AuthProviderStatus,
  CalendarEventsResponse,
  CalendarTasksResponse,
  CameraCaptureRequest,
  CameraStatusOut,
  DeviceCodeResponse,
  UserSettingsOut,
  UserSettingsUpdate,
  WeatherSnapshotOut,
  WidgetConfigOut,
  WidgetConfigUpdate,
} from './backendTypes';
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

export function triggerCameraCapture(req: CameraCaptureRequest): Promise<{ status: string }> {
  // #region agent log
  fetch('http://127.0.0.1:7343/ingest/d1269763-0513-4ea2-bf38-ef399503aff1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'90a4c0'},body:JSON.stringify({sessionId:'90a4c0',runId:'baseline',hypothesisId:'H6',location:'ui/src/api/mirrorApi.ts:53',message:'triggerCameraCapture invoked',data:{countdown_seconds:req.countdown_seconds,source:req.source,has_session_id:!!req.session_id},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
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
