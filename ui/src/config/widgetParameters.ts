import type { WidgetConfig } from '@/features/widgets/types';
import { getWidgetMetadata } from '@/features/widgets/registry';
import { WIDGET_SIZE_PRESETS, type WidgetSizePreset } from '@/features/widgets/sizePresets';

export type WidgetParameterOption = {
  label: string;
  value: string;
};

export type WidgetParameterDefinition = {
  name: string;
  key: 'enabled' | 'format' | 'sizePreset' | 'unit';
  options: WidgetParameterOption[];
};

export type WidgetParametersDefinition = {
  id: string;
  displayName: string;
  parameters: WidgetParameterDefinition[];
};

const CLOCK_PARAMETERS: WidgetParametersDefinition = {
  id: 'clock',
  displayName: 'Clock',
  parameters: [
    {
      name: 'Display',
      key: 'enabled',
      options: [
        { label: 'On', value: 'enabled' },
        { label: 'Off', value: 'disabled' },
      ],
    },
    {
      name: 'Time Format',
      key: 'format',
      options: [
        { label: '12hr', value: '12h' },
        { label: '24hr', value: '24h' },
      ],
    },
    {
      name: 'Size',
      key: 'sizePreset',
      options: [
        { label: 'Small', value: 'small' },
        { label: 'Medium', value: 'medium' },
        { label: 'Large', value: 'large' },
      ],
    },
  ],
};

const SIZE_PARAMETER: WidgetParameterDefinition = {
  name: 'Size',
  key: 'sizePreset',
  options: [
    { label: 'Small', value: 'small' },
    { label: 'Medium', value: 'medium' },
    { label: 'Large', value: 'large' },
  ],
};

const DISPLAY_PARAMETER: WidgetParameterDefinition = {
  name: 'Display',
  key: 'enabled',
  options: [
    { label: 'On', value: 'enabled' },
    { label: 'Off', value: 'disabled' },
  ],
};

const WEATHER_PARAMETERS: WidgetParametersDefinition = {
  id: 'weather',
  displayName: 'Weather',
  parameters: [
    DISPLAY_PARAMETER,
    {
      name: 'Temperature',
      key: 'unit',
      options: [
        { label: 'Fahrenheit (F)', value: 'imperial' },
        { label: 'Celsius (C)', value: 'metric' },
      ],
    },
    SIZE_PARAMETER,
  ],
};

export const WIDGET_PARAMETERS_MAP: Record<string, WidgetParametersDefinition> = {
  clock: CLOCK_PARAMETERS,
  weather: WEATHER_PARAMETERS,
};

function widgetBaseType(type: string): string {
  const normalized = (type || '').trim().toLowerCase();
  const colon = normalized.indexOf(':');
  if (colon > 0) return normalized.slice(0, colon);
  return normalized;
}

export function getWidgetParametersForType(type: string): WidgetParametersDefinition | null {
  const key = widgetBaseType(type);
  const explicit = WIDGET_PARAMETERS_MAP[key];
  if (explicit) return explicit;
  return {
    id: key || 'widget',
    displayName: getWidgetDisplayName(type),
    parameters: [DISPLAY_PARAMETER, SIZE_PARAMETER],
  };
}

export function getWidgetDisplayName(type: string): string {
  const params = WIDGET_PARAMETERS_MAP[widgetBaseType(type)];
  if (params?.displayName) return params.displayName;
  const meta = getWidgetMetadata(type);
  if (meta?.title) return meta.title;
  const base = widgetBaseType(type);
  if (!base) return 'Widget';
  return base
    .split('_')
    .filter(Boolean)
    .map((piece) => piece[0].toUpperCase() + piece.slice(1))
    .join(' ');
}

export function readWidgetParameterValue(widget: WidgetConfig, key: WidgetParameterDefinition['key']): string {
  if (key === 'enabled') return widget.enabled ? 'enabled' : 'disabled';
  if (key === 'format') return widget.format === '12h' ? '12h' : '24h';
  if (key === 'unit') return widget.unit === 'metric' ? 'metric' : 'imperial';
  const preset = widget.freeform.sizePreset ?? 'medium';
  return preset;
}

function nextOptionValue(options: WidgetParameterOption[], currentValue: string): string {
  if (options.length === 0) return currentValue;
  const currentIndex = options.findIndex((option) => option.value === currentValue);
  const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % options.length;
  return options[nextIndex].value;
}

export function cycleWidgetParameter(
  widget: WidgetConfig,
  parameter: WidgetParameterDefinition,
): { widget: WidgetConfig; previousValue: string; nextValue: string } {
  const previousValue = readWidgetParameterValue(widget, parameter.key);
  const nextValue = nextOptionValue(parameter.options, previousValue);
  if (parameter.key === 'enabled') {
    return {
      widget: { ...widget, enabled: nextValue === 'enabled' },
      previousValue,
      nextValue,
    };
  }
  if (parameter.key === 'format') {
    return {
      widget: { ...widget, format: nextValue === '12h' ? '12h' : '24h' },
      previousValue,
      nextValue,
    };
  }
  if (parameter.key === 'unit') {
    return {
      widget: { ...widget, unit: nextValue === 'metric' ? 'metric' : 'imperial' },
      previousValue,
      nextValue,
    };
  }

  const nextPreset = nextValue as WidgetSizePreset;
  const dims = WIDGET_SIZE_PRESETS[nextPreset] ?? WIDGET_SIZE_PRESETS.medium;
  return {
    widget: {
      ...widget,
      freeform: {
        ...widget.freeform,
        width: dims.width,
        height: dims.height,
        sizePreset: nextPreset,
      },
    },
    previousValue,
    nextValue,
  };
}

export function formatWidgetParameterValue(
  parameter: WidgetParameterDefinition,
  value: string,
): string {
  return parameter.options.find((option) => option.value === value)?.label ?? value;
}
