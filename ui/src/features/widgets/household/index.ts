import type { WidgetMetadata } from '../types';
import { HouseholdWidget } from './HouseholdWidget';

export const householdWidget: WidgetMetadata = {
  title: 'Household',
  defaultGrid: { rowSpan: 1, colSpan: 1 },
  minSize: { width: 200, height: 120 },
  Component: HouseholdWidget,
};
