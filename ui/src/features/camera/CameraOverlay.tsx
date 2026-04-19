import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useCameraStream } from './useCameraStream';
import './camera-overlay.css';

export const CameraOverlay: React.FC<{
  onClose: () => void;
  countdown?: number | null;
  errorMessage?: string | null;
  loading?: boolean;
  onPreviewFrameLoaded?: () => void;
}> = ({
  onClose,
  countdown = null,
  errorMessage = null,
  loading = false,
  onPreviewFrameLoaded,
}) => {
  const { mode, stream, frameSrc, status, markLoaded, markError } = useCameraStream();
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || mode !== 'webrtc') return;
    el.srcObject = stream;
    return () => {
      if (el.srcObject) el.srcObject = null;
    };
  }, [mode, stream]);

  return (
    <div className="camera-overlay">
      <div className="camera-stage">
        <div className="camera-video-wrap">
          {mode === 'webrtc' ? (
            <video
              ref={videoRef}
              className="camera-video"
              aria-label="Camera preview"
              autoPlay
              muted
              playsInline
              onLoadedData={() => {
                markLoaded();
                onPreviewFrameLoaded?.();
              }}
              onError={markError}
            />
          ) : (
            <img
              src={frameSrc}
              className="camera-video"
              aria-label="Camera preview"
              decoding="async"
              referrerPolicy="no-referrer"
              onLoad={() => {
                markLoaded();
                onPreviewFrameLoaded?.();
              }}
              onError={markError}
            />
          )}
          {loading && (
            <div className="camera-status camera-status-loading camera-status-boot">
              <div className="camera-loading-content">
                <span className="camera-loading-spinner" aria-hidden="true" />
                <span>Booting the camera</span>
              </div>
            </div>
          )}
          {!loading && status === 'loading' && !(typeof countdown === 'number' && countdown > 0) && (
            <div className="camera-status camera-status-loading">
              <div className="camera-loading-content">
                <span className="camera-loading-spinner" aria-hidden="true" />
                <span>Starting camera…</span>
              </div>
            </div>
          )}
          {status === 'error' && (
            <div className="camera-status camera-status-error">
              <div className="camera-error-content">
                <strong>Mirror camera preview unavailable.</strong>
                {errorMessage && <span>{errorMessage}</span>}
              </div>
            </div>
          )}
          {!loading && typeof countdown === 'number' && countdown > 0 && (
            <div className="camera-countdown-badge" role="status" aria-live="polite">
              <span className="camera-countdown-label">Photo in</span>
              <span className="camera-countdown-value">{countdown}</span>
              <span className="camera-countdown-unit">sec</span>
            </div>
          )}
        </div>
        <button type="button" className="camera-exit-btn" onClick={onClose}>
          <X size={20} /> Exit Camera
        </button>
      </div>
    </div>
  );
};
