const HARDWARE_ID_STORAGE_KEY = 'smart-mirror.hardware-id';
const HARDWARE_TOKEN_STORAGE_KEY = 'smart-mirror.hardware-token';
const ACTIVE_USER_ID_STORAGE_KEY = 'smart-mirror.active-user-id';

function readStorage(key: string): string | null {
  try {
    const value = window.localStorage.getItem(key)?.trim();
    return value || null;
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null): void {
  try {
    if (!value) {
      window.localStorage.removeItem(key);
      return;
    }
    window.localStorage.setItem(key, value);
  } catch {
    /* ignore storage failures */
  }
}

export function readMirrorHardwareId(): string {
  const configured = import.meta.env.VITE_MIRROR_HARDWARE_ID?.trim();
  if (configured) return configured;
  return readStorage(HARDWARE_ID_STORAGE_KEY) ?? 'smart-mirror-pi';
}

export function saveMirrorHardwareId(hardwareId: string): void {
  writeStorage(HARDWARE_ID_STORAGE_KEY, hardwareId.trim());
}

export function readMirrorHardwareToken(): string | null {
  const configured = import.meta.env.VITE_MIRROR_HARDWARE_TOKEN?.trim();
  if (configured) return configured;
  return readStorage(HARDWARE_TOKEN_STORAGE_KEY);
}

export function saveMirrorHardwareToken(token: string | null): void {
  writeStorage(HARDWARE_TOKEN_STORAGE_KEY, token?.trim() ?? null);
}

export function readActiveMirrorUserId(): string | null {
  return readStorage(ACTIVE_USER_ID_STORAGE_KEY);
}

export function saveActiveMirrorUserId(userId: string | null): void {
  writeStorage(ACTIVE_USER_ID_STORAGE_KEY, userId?.trim() ?? null);
}
