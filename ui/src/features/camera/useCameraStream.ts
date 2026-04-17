import { useEffect, useMemo, useState } from 'react';

import { getApiBase } from '@/config/backendOrigin';

export function useCameraStream() {
  const [tick, setTick] = useState(0);
  const [hasError, setHasError] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [consecutiveErrors, setConsecutiveErrors] = useState(0);

  const intervalMs = useMemo(() => {
    if (consecutiveErrors >= 3) return 5000;
    if (hasError) return 2000;
    return 450;
  }, [consecutiveErrors, hasError]);

  useEffect(() => {
    const id = window.setInterval(() => setTick((v) => v + 1), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);

  const frameSrc = useMemo(() => `${getApiBase()}/camera/preview.jpg?t=${tick}`, [tick]);

  return {
    frameSrc,
    status: hasError ? 'error' : loadedOnce ? 'live' : 'loading',
    markLoaded: () => {
      setLoadedOnce(true);
      setHasError(false);
      setConsecutiveErrors(0);
    },
    markError: () => {
      setHasError(true);
      setConsecutiveErrors((v) => v + 1);
    },
  } as const;
}
