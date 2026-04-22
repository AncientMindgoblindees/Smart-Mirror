import { useState, useEffect } from 'react';

function detectAutoPerformanceMode(): boolean {
  if (typeof window === 'undefined') return false;

  const ua = `${window.navigator.userAgent} ${window.navigator.platform ?? ''}`.toLowerCase();
  const isLinuxArm = ua.includes('linux') && /(aarch64|arm64|armv7l|armv8l)/.test(ua);
  const lowCoreDevice =
    typeof window.navigator.hardwareConcurrency === 'number' &&
    window.navigator.hardwareConcurrency > 0 &&
    window.navigator.hardwareConcurrency <= 4;

  try {
    const override = window.localStorage.getItem('smart-mirror.performance-mode');
    if (override === 'off') return false;
    if (override === 'on') return true;
  } catch {
    /* ignore storage access issues */
  }

  return isLinuxArm || lowCoreDevice;
}

export function readPerformanceModeState(): boolean {
  return detectAutoPerformanceMode();
}

function readReducedMotionState(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches || readPerformanceModeState();
}

export function usePerformanceMode(): boolean {
  const [performanceMode, setPerformanceMode] = useState(readPerformanceModeState);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = () => setPerformanceMode(readPerformanceModeState());
    mq.addEventListener('change', handler);
    window.addEventListener('storage', handler);
    return () => {
      mq.removeEventListener('change', handler);
      window.removeEventListener('storage', handler);
    };
  }, []);

  return performanceMode;
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(readReducedMotionState);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = () => setReduced(readReducedMotionState());
    mq.addEventListener('change', handler);
    window.addEventListener('storage', handler);
    return () => {
      mq.removeEventListener('change', handler);
      window.removeEventListener('storage', handler);
    };
  }, []);

  return reduced;
}
