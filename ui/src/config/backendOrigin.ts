/**
 * Split-host deploy: UI on one hostname (e.g. mirror.smart-mirror.tech), API on another
 * (e.g. smart-mirror.tech). Set at build time:
 *   VITE_BACKEND_ORIGIN=https://smart-mirror.tech
 * Omit or leave empty to use same-origin /api and WebSockets on the page host.
 */
export function getConfiguredBackendOrigin(): URL | null {
  const raw = import.meta.env.VITE_BACKEND_ORIGIN?.trim();
  if (!raw) return null;
  try {
    return new URL(raw);
  } catch {
    console.warn('[mirror-ui] VITE_BACKEND_ORIGIN is invalid:', raw);
    return null;
  }
}

export function getApiBase(): string {
  const o = getConfiguredBackendOrigin();
  if (o) return `${o.origin}/api`;
  return '/api';
}

export function getApiToken(): string {
  return (import.meta.env.VITE_API_TOKEN ?? '').trim();
}

/** @param path - Absolute path, e.g. `/ws/buttons` */
export function getWebSocketUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const token = getApiToken();
  const o = getConfiguredBackendOrigin();
  if (o) {
    const wsProto = o.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = new URL(`${wsProto}//${o.host}${normalized}`);
    if (token) url.searchParams.set('token', token);
    return url.toString();
  }
  const wsProto = globalThis.location?.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = globalThis.location?.host ?? 'localhost';
  const url = new URL(`${wsProto}//${host}${normalized}`);
  if (token) url.searchParams.set('token', token);
  return url.toString();
}
