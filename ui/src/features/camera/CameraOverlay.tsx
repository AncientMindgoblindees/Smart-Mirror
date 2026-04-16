import React from 'react';
import { X } from 'lucide-react';
import { useCameraStream } from './useCameraStream';
import './camera-overlay.css';

export const CameraOverlay: React.FC<{ onClose: () => void; countdown?: number | null }> = ({
  onClose,
  countdown = null,
}) => {
  const { frameSrc, status, markLoaded, markError } = useCameraStream();

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
          {status === 'loading' && (
            <div className="camera-status camera-status-loading">Starting camera…</div>
          )}
          {status === 'error' && (
            <div className="camera-status camera-status-error">
              Mirror camera preview unavailable.
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
