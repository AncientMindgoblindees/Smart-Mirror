export type WidgetThemePreset = {
  id: string;
  label: string;
  hint: string;
};

export type BackgroundThemePreset = {
  id: string;
  label: string;
  hint: string;
};

export type ThemeSelection = {
  widgetTheme: string;
  backgroundTheme: string;
};

export const WIDGET_THEME_PRESETS: WidgetThemePreset[] = [
  { id: 'glass-cyan', label: 'Glass Cyan', hint: 'Classic mirror glass' },
  { id: 'steel-mono', label: 'Steel Mono', hint: 'Neutral metallic' },
  { id: 'amber-gold', label: 'Amber Gold', hint: 'Warm brass glow' },
  { id: 'pearl-white', label: 'Pearl White', hint: 'Clean white crystal' },
  { id: 'gloss-black', label: 'Gloss Black', hint: 'High contrast glossy' },
  { id: 'mint-neon', label: 'Mint Neon', hint: 'Bright modern accent' },
];

export const BACKGROUND_THEME_PRESETS: BackgroundThemePreset[] = [
  { id: 'noir', label: 'Noir', hint: 'Dark black ambient' },
  { id: 'frost-blue', label: 'Frost Blue', hint: 'Cool cyan atmosphere' },
  { id: 'dawn-amber', label: 'Dawn Amber', hint: 'Warm sunset ambient' },
  { id: 'studio-white', label: 'Studio White', hint: 'Soft white mirror room' },
  { id: 'graphite', label: 'Graphite', hint: 'Glossy deep charcoal' },
  { id: 'emerald', label: 'Emerald', hint: 'Calm green lounge glow' },
];

const LEGACY_THEME_MAP: Record<string, ThemeSelection> = {
  dark: { widgetTheme: 'glass-cyan', backgroundTheme: 'noir' },
  'mirror-dark': { widgetTheme: 'glass-cyan', backgroundTheme: 'noir' },
  'frost-blue': { widgetTheme: 'glass-cyan', backgroundTheme: 'frost-blue' },
  'warm-amber': { widgetTheme: 'amber-gold', backgroundTheme: 'dawn-amber' },
  'forest-glass': { widgetTheme: 'glass-cyan', backgroundTheme: 'frost-blue' },
  'mono-steel': { widgetTheme: 'steel-mono', backgroundTheme: 'noir' },
  light: { widgetTheme: 'steel-mono', backgroundTheme: 'frost-blue' },
  'studio-white': { widgetTheme: 'pearl-white', backgroundTheme: 'studio-white' },
  graphite: { widgetTheme: 'gloss-black', backgroundTheme: 'graphite' },
};

const WIDGET_SET = new Set(WIDGET_THEME_PRESETS.map((theme) => theme.id));
const BACKGROUND_SET = new Set(BACKGROUND_THEME_PRESETS.map((theme) => theme.id));

export function serializeThemeSelection(selection: ThemeSelection): string {
  return `w:${selection.widgetTheme}|b:${selection.backgroundTheme}`;
}

export function parseThemeSelection(input: string | null | undefined): ThemeSelection {
  const raw = (input || '').trim();
  if (LEGACY_THEME_MAP[raw]) return LEGACY_THEME_MAP[raw];

  const out: ThemeSelection = {
    widgetTheme: 'glass-cyan',
    backgroundTheme: 'noir',
  };

  const pieces = raw.split('|');
  for (const piece of pieces) {
    const trimmed = piece.trim();
    if (trimmed.startsWith('w:')) {
      const value = trimmed.slice(2);
      if (WIDGET_SET.has(value)) out.widgetTheme = value;
    }
    if (trimmed.startsWith('b:')) {
      const value = trimmed.slice(2);
      if (BACKGROUND_SET.has(value)) out.backgroundTheme = value;
    }
  }

  return out;
}

export function getWidgetThemePreset(themeId: string): WidgetThemePreset {
  return WIDGET_THEME_PRESETS.find((theme) => theme.id === themeId) ?? WIDGET_THEME_PRESETS[0];
}

export function getBackgroundThemePreset(themeId: string): BackgroundThemePreset {
  return BACKGROUND_THEME_PRESETS.find((theme) => theme.id === themeId) ?? BACKGROUND_THEME_PRESETS[0];
}
