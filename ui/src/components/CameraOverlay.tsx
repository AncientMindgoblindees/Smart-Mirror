import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

type CameraState =
  | { status: 'loading' }
  | { status: 'live'; stream: MediaStream }
  | { status: 'error'; message: string };

function getErrorMessage(err: unknown): string {
  if (err instanceof DOMException) {
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      return 'Camera blocked — allow permission in your browser settings.';
    }
    if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
      return 'No camera found.';
    }
    if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
      return 'Camera is in use by another app.';
    }
    return err.message || 'Could not open camera.';
  }
  if (err instanceof Error) return err.message;
  return 'Could not open camera.';
}

export const CameraOverlay: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [camera, setCamera] = useState<CameraState>({ status: 'loading' });

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
        if (!cancelled) setCamera({ status: 'error', message: getErrorMessage(e) });
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
    const play = () => el.play().catch(() => {});
    play();
    return () => {
      el.srcObject = null;
    };
  }, [camera]);

  const handleClose = () => {
    if (camera.status === 'live') {
      camera.stream.getTracks().forEach((t) => t.stop());
    }
    onClose();
  };

  return (
    <div className="camera-overlay">
      <div className="camera-stage">
        <div className="camera-video-wrap">
          <video
            ref={videoRef}
            className="camera-video"
            playsInline
            muted
            autoPlay
            aria-label="Camera preview"
          />
          {camera.status === 'loading' && (
            <div className="camera-status camera-status-loading">Starting camera…</div>
          )}
          {camera.status === 'error' && (
            <div className="camera-status camera-status-error">{camera.message}</div>
          )}
        </div>
        <button type="button" className="exit-btn" onClick={handleClose}>
          <X size={20} /> Exit Camera
        </button>
      </div>
    </div>
  );
};
