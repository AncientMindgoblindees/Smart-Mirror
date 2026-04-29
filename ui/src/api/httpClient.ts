import { getApiBase, getApiToken } from '@/config/backendOrigin';

const API_BASE = getApiBase();

export async function jsonRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getApiToken();
  const res = await fetch(`${API_BASE}${path}`, {
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}
