import { useCallback, useMemo, useState } from 'react';

import { getApiBase } from '@/config/backendOrigin';

/**
 * Pi camera is not exposed to the browser as a MediaDevice — only the backend can open it.
 * Live view is one MJPEG stream: GET `/api/camera/stream.mjpg`.
 */
export function useCameraStream() {
  const [rev, setRev] = useState(0);
  const frameSrc = useMemo(
    () => `${getApiBase()}/camera/stream.mjpg?r=${rev}`,
    [rev],
  );

  const [hasError, setHasError] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);

  const markLoaded = useCallback(() => {
    setLoadedOnce(true);
    setHasError(false);
  }, []);

  const markError = useCallback(() => {
    setHasError(true);
    setLoadedOnce(false);
    setRev((r) => r + 1);
  }, []);

  return {
    frameSrc,
    status: hasError ? 'error' : loadedOnce ? 'live' : 'loading',
    markLoaded,
    markError,
  } as const;
}
