import type {
  UserSettingsOut,
  UserSettingsUpdate,
  WidgetConfigOut,
  WidgetConfigUpdate,
} from './backendTypes';

const API_BASE = '/api';

async function jsonRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

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
