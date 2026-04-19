import React from 'react';
import { X } from 'lucide-react';
import { useCameraStream } from './useCameraStream';
import './camera-overlay.css';

export const CameraOverlay: React.FC<{
  onClose: () => void;
  countdown?: number | null;
  errorMessage?: string | null;
  loading?: boolean;
}> = ({
  onClose,
  countdown = null,
  errorMessage = null,
  loading = false,
}) => {
  const { frameSrc, status, markLoaded, markError } = useCameraStream({
    aggressive: loading || (typeof countdown === 'number' && countdown > 0),
  });

  return (
    <div className="camera-overlay">
      <div className="camera-stage">
        <div className="camera-video-wrap">
          <img
            src={frameSrc}
            className="camera-video"
            aria-label="Camera preview"
            onLoad={markLoaded}
            onError={markError}
          />
          {(loading || status === 'loading') && (
            <div className="camera-status camera-status-loading">
              <div className="camera-loading-content">
                <span className="camera-loading-spinner" aria-hidden="true" />
                <span>{loading ? 'Camera Loading…' : 'Starting camera…'}</span>
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
          {typeof countdown === 'number' && countdown > 0 && (
            <div className="camera-status camera-status-loading">Capture in {countdown}…</div>
          )}
        </div>
        <button type="button" className="camera-exit-btn" onClick={onClose}>
          <X size={20} /> Exit Camera
        </button>
      </div>
    </div>
  );
};
