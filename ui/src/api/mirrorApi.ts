import type {
  AuthLoginStatus,
  AuthProviderStatus,
  CalendarEventsResponse,
  CalendarTasksResponse,
  CameraCaptureRequest,
  CameraStatusOut,
  DeviceCodeResponse,
  EmailMessagesResponse,
  MirrorProfile,
  MirrorRegistrationRequest,
  MirrorRegistrationResponse,
  MirrorSyncResponse,
  ProfileActivateRequest,
  ProfileEnrollRequest,
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
  return jsonRequest<{ status: string }>('/camera/capture', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

export function registerMirror(payload: MirrorRegistrationRequest): Promise<MirrorRegistrationResponse> {
  return jsonRequest<MirrorRegistrationResponse>('/mirror/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getMirrorSync(): Promise<MirrorSyncResponse> {
  return jsonRequest<MirrorSyncResponse>('/mirror/sync');
}

export function listProfiles(): Promise<MirrorProfile[]> {
  return jsonRequest<MirrorProfile[]>('/profile/');
}

export function enrollProfile(payload: ProfileEnrollRequest): Promise<MirrorProfile> {
  return jsonRequest<MirrorProfile>('/profile/enroll', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function activateProfile(payload: ProfileActivateRequest): Promise<MirrorProfile> {
  return jsonRequest<MirrorProfile>('/profile/activate', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function deleteProfile(userId: string): Promise<{ status: string }> {
  return jsonRequest<{ status: string }>(`/profile/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
  });
}

export function getAuthProviders(hardwareId: string, userId: string): Promise<AuthProviderStatus[]> {
  return jsonRequest<AuthProviderStatus[]>(
    withQuery('/auth/providers', { hardware_id: hardwareId, user_id: userId }),
  );
}

export function startLogin(provider: string, hardwareId: string, userId: string): Promise<DeviceCodeResponse> {
  return jsonRequest<DeviceCodeResponse>(
    withQuery(`/auth/login/${provider}`, { hardware_id: hardwareId, user_id: userId }),
    { method: 'POST' },
  );
}

export function getLoginStatus(provider: string, hardwareId: string, userId: string): Promise<AuthLoginStatus> {
  return jsonRequest<AuthLoginStatus>(
    withQuery(`/auth/login/${provider}/status`, { hardware_id: hardwareId, user_id: userId }),
  );
}

export function logoutProvider(provider: string, hardwareId: string, userId: string): Promise<{ status: string }> {
  return jsonRequest<{ status: string }>(
    withQuery(`/auth/logout/${provider}`, { hardware_id: hardwareId, user_id: userId }),
    { method: 'DELETE' },
  );
}

export function cancelLogin(provider: string, hardwareId: string, userId: string): Promise<{ status: string }> {
  return jsonRequest<{ status: string }>(
    withQuery(`/auth/login/${provider}/cancel`, { hardware_id: hardwareId, user_id: userId }),
    { method: 'POST' },
  );
}

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
