export type WidgetSizePreset = 'small' | 'medium' | 'large';

export const WIDGET_SIZE_PRESETS: Record<WidgetSizePreset, { width: number; height: number }> = {
  small: { width: 22, height: 14 },
  medium: { width: 32, height: 20 },
  large: { width: 44, height: 28 },
};

export function inferWidgetSizePreset(width: number, height: number): WidgetSizePreset {
  const entries = Object.entries(WIDGET_SIZE_PRESETS) as Array<
    [WidgetSizePreset, { width: number; height: number }]
  >;
  let best: WidgetSizePreset = 'medium';
  let bestScore = Number.POSITIVE_INFINITY;
  for (const [preset, dims] of entries) {
    const dx = width - dims.width;
    const dy = height - dims.height;
    const score = dx * dx + dy * dy;
    if (score < bestScore) {
      bestScore = score;
      best = preset;
    }
  }
  return best;
}
