export type DeviceHints = {
  hardwareConcurrency?: number;
  deviceMemory?: number;
};

export function shouldUsePerformanceLiteMode(hints: DeviceHints): boolean {
  const cores = typeof hints.hardwareConcurrency === 'number' ? hints.hardwareConcurrency : 8;
  const memory = typeof hints.deviceMemory === 'number' ? hints.deviceMemory : 8;
  return cores <= 4 || memory <= 4;
}

export function shouldShowMenuPreviewInLiteMode(layer: string): boolean {
  return layer === 'main' || layer === 'widget_list' || layer === 'parameter_editor';
}
