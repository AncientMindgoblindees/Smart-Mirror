import { useEffect, useMemo, useState } from 'react';

import { getApiBase } from '@/config/backendOrigin';

export function useCameraStream() {
  const [tick, setTick] = useState(0);
  const [hasError, setHasError] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => setTick((v) => v + 1), 450);
    return () => window.clearInterval(id);
  }, []);

  const frameSrc = useMemo(() => `${getApiBase()}/camera/preview.jpg?t=${tick}`, [tick]);

  return {
    frameSrc,
    status: hasError ? 'error' : loadedOnce ? 'live' : 'loading',
    markLoaded: () => {
      setLoadedOnce(true);
      setHasError(false);
    },
    markError: () => {
      setHasError(true);
    },
  } as const;
}
