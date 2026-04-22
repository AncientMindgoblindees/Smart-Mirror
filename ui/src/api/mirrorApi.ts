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
  SessionMeResponse,
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

export function getWidgets(request?: RequestInit): Promise<WidgetConfigOut[]> {
  return jsonRequest<WidgetConfigOut[]>('/widgets/', request);
}

export function putWidgets(configs: WidgetConfigUpdate[]): Promise<WidgetConfigOut[]> {
  return jsonRequest<WidgetConfigOut[]>('/widgets/', {
    method: 'PUT',
    body: JSON.stringify(configs),
  });
}

export function getUserSettings(request?: RequestInit): Promise<UserSettingsOut> {
  return jsonRequest<UserSettingsOut>('/user/settings', request);
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
}, request?: RequestInit): Promise<WeatherSnapshotOut> {
  return jsonRequest<WeatherSnapshotOut>(withQuery('/weather/', { q: opts?.q, units: opts?.units }), request);
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

export function getMirrorSync(request?: RequestInit): Promise<MirrorSyncResponse> {
  return jsonRequest<MirrorSyncResponse>('/mirror/sync', request);
}

export function getSessionMe(request?: RequestInit): Promise<SessionMeResponse> {
  return jsonRequest<SessionMeResponse>('/session/me', request);
}

export function listProfiles(request?: RequestInit): Promise<MirrorProfile[]> {
  return jsonRequest<MirrorProfile[]>('/profile/', request);
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

export function getAuthProviders(
  hardwareId: string,
  userId?: string | null,
  request?: RequestInit,
): Promise<AuthProviderStatus[]> {
  return jsonRequest<AuthProviderStatus[]>(
    withQuery('/auth/providers', { hardware_id: hardwareId, user_id: userId ?? undefined }),
    request,
  );
}

export function startLogin(
  provider: string,
  hardwareId: string,
  userId?: string | null,
  opts?: { intent?: 'pair_profile' | 'create_account'; targetUserId?: string },
  request?: RequestInit,
): Promise<DeviceCodeResponse> {
  const effectiveUserId = opts?.targetUserId?.trim() || userId?.trim();
  return jsonRequest<DeviceCodeResponse>(
    withQuery(`/auth/login/${provider}`, {
      hardware_id: hardwareId,
      user_id: effectiveUserId || undefined,
      intent: opts?.intent,
    }),
    { method: 'POST', ...request },
  );
}

export function getLoginStatus(provider: string, hardwareId: string, userId?: string | null): Promise<AuthLoginStatus> {
  return getLoginStatusWithPairing(provider, hardwareId, userId);
}

export function getLoginStatusWithPairing(
  provider: string,
  hardwareId: string,
  userId?: string | null,
  pairingId?: string | null,
  request?: RequestInit,
): Promise<AuthLoginStatus> {
  return jsonRequest<AuthLoginStatus>(
    withQuery(`/auth/login/${provider}/status`, {
      hardware_id: hardwareId,
      user_id: userId ?? undefined,
      pairing_id: pairingId ?? undefined,
    }),
    request,
  );
}

export function logoutProvider(provider: string, hardwareId: string, userId?: string | null): Promise<{ status: string }> {
  return jsonRequest<{ status: string }>(
    withQuery(`/auth/logout/${provider}`, { hardware_id: hardwareId, user_id: userId ?? undefined }),
    { method: 'DELETE' },
  );
}

export function cancelLogin(provider: string, hardwareId: string, userId?: string | null): Promise<{ status: string }> {
  return cancelLoginWithPairing(provider, hardwareId, userId);
}

export function cancelLoginWithPairing(
  provider: string,
  hardwareId: string,
  userId?: string | null,
  pairingId?: string | null,
): Promise<{ status: string }> {
  return jsonRequest<{ status: string }>(
    withQuery(`/auth/login/${provider}/cancel`, {
      hardware_id: hardwareId,
      user_id: userId ?? undefined,
      pairing_id: pairingId ?? undefined,
    }),
    { method: 'POST' },
  );
}

export function getCalendarEvents(opts?: {
  days?: number;
  provider?: string;
}, request?: RequestInit): Promise<CalendarEventsResponse> {
  return jsonRequest<CalendarEventsResponse>(
    withQuery('/calendar/events', { days: opts?.days, provider: opts?.provider }),
    request,
  );
}

export function getCalendarTasks(opts?: {
  provider?: string;
}, request?: RequestInit): Promise<CalendarTasksResponse> {
  return jsonRequest<CalendarTasksResponse>(
    withQuery('/calendar/tasks', { provider: opts?.provider }),
    request,
  );
}

export function getEmailMessages(opts?: {
  provider?: string;
  limit?: number;
}, request?: RequestInit): Promise<EmailMessagesResponse> {
  return jsonRequest<EmailMessagesResponse>(
    withQuery('/email/messages', { provider: opts?.provider, limit: opts?.limit }),
    request,
  );
}
