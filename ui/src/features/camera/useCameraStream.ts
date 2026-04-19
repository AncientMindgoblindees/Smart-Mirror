import { useCallback, useEffect, useMemo, useState } from 'react';

import { getApiBase } from '@/config/backendOrigin';

/**
 * Pi camera is not exposed to the browser as a MediaDevice — only the backend can open it.
 * Prefer WebRTC for lower-latency preview; fall back to MJPEG stream when needed.
 */
export function useCameraStream() {
  const [mode, setMode] = useState<'webrtc' | 'mjpeg'>('webrtc');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [rev, setRev] = useState(0);
  const frameSrc = useMemo(
    () => `${getApiBase()}/camera/live?r=${rev}`,
    [rev],
  );

  const [hasError, setHasError] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let startedTrack = false;
    let timeoutId: ReturnType<typeof window.setTimeout> | null = null;
    const pc = new RTCPeerConnection();

    const fallbackToMjpeg = () => {
      if (cancelled) return;
      setMode('mjpeg');
      setStream(null);
    };

    pc.addTransceiver('video', { direction: 'recvonly' });
    pc.ontrack = (ev) => {
      startedTrack = true;
      if (cancelled) return;
      const incoming = ev.streams[0] ?? new MediaStream([ev.track]);
      setStream(incoming);
      setMode('webrtc');
      setHasError(false);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        fallbackToMjpeg();
      }
    };

    void (async () => {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        const local = pc.localDescription;
        if (!local) throw new Error('missing localDescription');
        const res = await fetch(`${getApiBase()}/camera/webrtc/offer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sdp: local.sdp,
            type: local.type,
          }),
        });
        if (!res.ok) throw new Error(`webrtc offer failed ${res.status}`);
        const answer = (await res.json()) as RTCSessionDescriptionInit;
        await pc.setRemoteDescription(answer);
        timeoutId = window.setTimeout(() => {
          if (!startedTrack) fallbackToMjpeg();
        }, 2500);
      } catch {
        fallbackToMjpeg();
      }
    })();

    return () => {
      cancelled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
      pc.close();
    };
  }, []);

  const markLoaded = useCallback(() => {
    setLoadedOnce(true);
    setHasError(false);
  }, []);

  const markError = useCallback(() => {
    setHasError(true);
    setLoadedOnce(false);
    setMode('mjpeg');
    setStream(null);
    setRev((r) => r + 1);
  }, []);

  return {
    mode,
    stream,
    frameSrc,
    status: hasError ? 'error' : loadedOnce ? 'live' : 'loading',
    markLoaded,
    markError,
  } as const;
}
