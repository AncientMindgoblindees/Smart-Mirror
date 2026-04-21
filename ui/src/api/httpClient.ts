import { getApiBase } from '@/config/backendOrigin';
import {
  readActiveMirrorUserId,
  readMirrorHardwareId,
  readMirrorHardwareToken,
} from './deviceIdentity';

const API_BASE = getApiBase();

export async function jsonRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers ?? {});
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const hardwareId = readMirrorHardwareId();
  if (hardwareId && !headers.has('X-Mirror-Hardware-Id')) {
    headers.set('X-Mirror-Hardware-Id', hardwareId);
  }

  const hardwareToken = readMirrorHardwareToken();
  if (hardwareToken && !headers.has('X-Mirror-Hardware-Token')) {
    headers.set('X-Mirror-Hardware-Token', hardwareToken);
  }

  const activeUserId = readActiveMirrorUserId();
  if (activeUserId && !headers.has('X-Mirror-User-Id')) {
    headers.set('X-Mirror-User-Id', activeUserId);
  }

  const res = await fetch(`${API_BASE}${path}`, {
    cache: 'no-store',
    headers,
    ...options,
  });
  if (!res.ok) {
    let detail = `Request failed: ${res.status} ${res.statusText}`;
    try {
      const payload = (await res.json()) as { detail?: string; message?: string };
      detail = payload.detail || payload.message || detail;
    } catch {
      // ignore parse failures
    }
    throw new Error(detail);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}
