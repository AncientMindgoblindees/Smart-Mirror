import { getApiBase, getApiToken } from '@/config/backendOrigin';

export function withApiTokenIfProtectedMedia(url: string): string {
  const raw = (url || '').trim();
  if (!raw) return raw;
  if (raw.startsWith('blob:') || raw.startsWith('data:')) return raw;

  let parsed: URL;
  try {
    parsed = new URL(raw, getApiBase());
  } catch {
    return raw;
  }

  const apiBase = getApiBase();
  const apiOrigin = new URL(apiBase).origin;
  const isApiPath = parsed.pathname.startsWith('/api/');
  const sameOrigin = parsed.origin === apiOrigin;
  if (!sameOrigin || !isApiPath) return raw;

  const token = getApiToken();
  if (!token) return parsed.toString();
  if (!parsed.searchParams.get('token')) {
    parsed.searchParams.set('token', token);
  }
  return parsed.toString();
}
