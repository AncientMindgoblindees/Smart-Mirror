import type { UserSettingsOut } from '@/api/backendTypes';
import { parseThemeSelection } from '@/config/themePresets';

export function applyUserSettings(settings: UserSettingsOut): void {
  const root = document.documentElement;
  const selection = parseThemeSelection(settings.theme);
  if (settings.accent_color) {
    root.style.setProperty('--color-accent', settings.accent_color);
  }
  if (typeof settings.primary_font_size === 'number') {
    root.style.setProperty('--fs-display', `${settings.primary_font_size}px`);
  }
  root.setAttribute('data-widget-theme', selection.widgetTheme);
  root.setAttribute('data-background-theme', selection.backgroundTheme);
}
