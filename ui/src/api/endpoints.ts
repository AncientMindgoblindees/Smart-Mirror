export function withQuery(path: string, params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && String(v).length > 0) sp.set(k, String(v));
  });
  const qs = sp.toString();
  return `${path}${qs ? `?${qs}` : ''}`;
}
