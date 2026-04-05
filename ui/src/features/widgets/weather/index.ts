import type { WidgetMetadata } from '../types';
import { WeatherWidget } from './WeatherWidget';

export const weatherWidget: WidgetMetadata = {
  title: 'Weather',
  defaultGrid: { rowSpan: 1, colSpan: 1 },
  minSize: { width: 200, height: 150 },
  Component: WeatherWidget,
};
