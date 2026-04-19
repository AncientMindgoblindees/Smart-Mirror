import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { getApiBase } from '@/config/backendOrigin';

type CameraStreamOptions = {
  aggressive?: boolean;
  /** Faster cadence after a frame completes during visible live countdown. */
  turbo?: boolean;
};

/**
 * Polls JPEG preview frames sequentially (next request only after load/error).
 * Avoids changing <img src> on a fixed timer, which aborts in-flight loads and
 * often results in no visible live feed on embedded browsers.
 */
export function useCameraStream(options?: CameraStreamOptions) {
  const aggressive = Boolean(options?.aggressive);
  const turbo = Boolean(options?.turbo);

  const [hasError, setHasError] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [consecutiveErrors, setConsecutiveErrors] = useState(0);

  const intervalMs = useMemo(() => {
    if (turbo) return 220;
    if (aggressive) return 400;
    if (consecutiveErrors >= 3) return 5000;
    if (hasError) return 2000;
    return 500;
  }, [turbo, aggressive, consecutiveErrors, hasError]);

  const seqRef = useRef(0);
  const [frameSrc, setFrameSrc] = useState(
    () => `${getApiBase()}/camera/preview.jpg?t=${Date.now()}&n=0`,
  );

  const timerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const queueNextFrame = useCallback(() => {
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      seqRef.current += 1;
      setFrameSrc(`${getApiBase()}/camera/preview.jpg?t=${Date.now()}&n=${seqRef.current}`);
    }, intervalMs);
  }, [intervalMs, clearTimer]);

  useEffect(
    () => () => {
      clearTimer();
    },
    [clearTimer],
  );

  // When cadence changes (boot → countdown), reset stream with one fresh URL.
  useEffect(() => {
    clearTimer();
    seqRef.current += 1;
    setFrameSrc(`${getApiBase()}/camera/preview.jpg?t=${Date.now()}&n=${seqRef.current}`);
  }, [intervalMs, clearTimer]);

  const markLoaded = useCallback(() => {
    setLoadedOnce(true);
    setHasError(false);
    setConsecutiveErrors(0);
    queueNextFrame();
  }, [queueNextFrame]);

  const markError = useCallback(() => {
    setHasError(true);
    setConsecutiveErrors((v) => v + 1);
    queueNextFrame();
  }, [queueNextFrame]);

  return {
    frameSrc,
    status: hasError ? 'error' : loadedOnce ? 'live' : 'loading',
    markLoaded,
    markError,
  } as const;
}
