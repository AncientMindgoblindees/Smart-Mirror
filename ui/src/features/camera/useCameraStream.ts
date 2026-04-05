import { useEffect, useRef, useState, useCallback } from 'react';
import { getCameraErrorMessage } from './cameraErrors';

export type CameraStreamState =
  | { status: 'loading' }
  | { status: 'live'; stream: MediaStream }
  | { status: 'error'; message: string };

export function useCameraStream() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [camera, setCamera] = useState<CameraStreamState>({ status: 'loading' });

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setCamera({
            status: 'error',
            message: 'Camera API not available (use HTTPS or localhost).',
          });
          return;
        }
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'user' } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        setCamera({ status: 'live', stream });
      } catch (e) {
        if (!cancelled) setCamera({ status: 'error', message: getCameraErrorMessage(e) });
      }
    })();

    return () => {
      cancelled = true;
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || camera.status !== 'live') return;
    el.srcObject = camera.stream;
    void el.play().catch(() => {});
    return () => {
      el.srcObject = null;
    };
  }, [camera]);

  const stopTracks = useCallback(() => {
    if (camera.status === 'live') {
      camera.stream.getTracks().forEach((t) => t.stop());
    }
  }, [camera]);

  return { camera, videoRef, stopTracks };
}
