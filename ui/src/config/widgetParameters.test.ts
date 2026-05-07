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

  it('exposes calendar view and time format controls', () => {
    const def = getWidgetParametersForType('calendar');
    expect(def?.parameters.some((p) => p.key === 'view')).toBe(true);
    expect(def?.parameters.some((p) => p.key === 'timeFormat')).toBe(true);

    const calendarWidget: WidgetConfig = {
      ...BASE_WIDGET,
      type: 'calendar',
      view: 'day',
      timeFormat: '24h',
    };
    const viewParam = def?.parameters.find((p) => p.key === 'view');
    const timeParam = def?.parameters.find((p) => p.key === 'timeFormat');
    expect(viewParam).toBeTruthy();
    expect(timeParam).toBeTruthy();
    if (!viewParam || !timeParam) return;

    const nextView = cycleWidgetParameter(calendarWidget, viewParam);
    expect(nextView.widget.view).toBe('week');

    const nextTime = cycleWidgetParameter(calendarWidget, timeParam);
    expect(nextTime.widget.timeFormat).toBe('12h');
  });
});
