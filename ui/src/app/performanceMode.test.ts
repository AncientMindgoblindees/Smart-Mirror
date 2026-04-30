import { describe, expect, it } from 'vitest';
import { shouldShowMenuPreviewInLiteMode, shouldUsePerformanceLiteMode } from './performanceMode';

describe('shouldUsePerformanceLiteMode', () => {
  it('enables lite mode on low core-count devices', () => {
    expect(shouldUsePerformanceLiteMode({ hardwareConcurrency: 4, deviceMemory: 8 })).toBe(true);
  });

  it('enables lite mode on low-memory devices', () => {
    expect(shouldUsePerformanceLiteMode({ hardwareConcurrency: 8, deviceMemory: 4 })).toBe(true);
  });

  it('disables lite mode on capable devices', () => {
    expect(shouldUsePerformanceLiteMode({ hardwareConcurrency: 8, deviceMemory: 8 })).toBe(false);
  });

  it('defaults to non-lite mode when hints are unavailable', () => {
    expect(shouldUsePerformanceLiteMode({})).toBe(false);
  });
});

describe('shouldShowMenuPreviewInLiteMode', () => {
  it('hides preview for non-main layers in lite mode', () => {
    expect(shouldShowMenuPreviewInLiteMode('widget_list')).toBe(false);
    expect(shouldShowMenuPreviewInLiteMode('parameter_editor')).toBe(false);
  });

  it('allows main layer in lite mode', () => {
    expect(shouldShowMenuPreviewInLiteMode('main')).toBe(true);
  });
});
