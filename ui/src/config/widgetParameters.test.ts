import { describe, expect, it } from 'vitest';
import {
  cycleWidgetParameter,
  getWidgetParametersForType,
  readWidgetParameterValue,
} from './widgetParameters';
import type { WidgetConfig } from '@/features/widgets/types';

const BASE_WIDGET: WidgetConfig = {
  id: 'w-test',
  type: 'clock',
  enabled: true,
  grid: { row: 1, col: 1, rowSpan: 1, colSpan: 1 },
  freeform: { x: 0, y: 0, width: 32, height: 18, sizePreset: 'medium' },
  format: '12h',
};

describe('widgetParameters', () => {
  it('includes display toggle parameter for widgets', () => {
    const def = getWidgetParametersForType('clock');
    expect(def?.parameters.some((p) => p.key === 'enabled')).toBe(true);
  });

  it('cycles enabled parameter between on/off', () => {
    const def = getWidgetParametersForType('clock');
    const enabledParam = def?.parameters.find((p) => p.key === 'enabled');
    expect(enabledParam).toBeTruthy();
    if (!enabledParam) return;

    const first = cycleWidgetParameter(BASE_WIDGET, enabledParam);
    expect(first.widget.enabled).toBe(false);
    expect(readWidgetParameterValue(first.widget, 'enabled')).toBe('disabled');

    const second = cycleWidgetParameter(first.widget, enabledParam);
    expect(second.widget.enabled).toBe(true);
    expect(readWidgetParameterValue(second.widget, 'enabled')).toBe('enabled');
  });
});
