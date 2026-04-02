import type { UserSettingsOut } from './api/backendTypes';

export function applyUserSettings(settings: UserSettingsOut): void {
  const root = document.documentElement;
  if (settings.accent_color) {
    root.style.setProperty('--color-accent', settings.accent_color);
  }
  if (typeof settings.primary_font_size === 'number') {
    root.style.setProperty('--fs-display', `${settings.primary_font_size}px`);
  }
  if (settings.theme === 'light') {
    root.setAttribute('data-theme', 'light');
  } else {
    root.setAttribute('data-theme', 'mirror-dark');
  }
}
