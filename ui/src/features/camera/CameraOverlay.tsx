import React from 'react';
import { X } from 'lucide-react';
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
  onPreviewFrameLoaded: _onPreviewFrameLoaded,
}) => {
  return (
    <div className="camera-overlay">
      <div className="camera-stage">
        <div className="camera-video-wrap">
          <div className="camera-native-preview-hint" aria-live="polite">
            Native camera preview is running.
          </div>
          {loading && (
            <div className="camera-status camera-status-loading camera-status-boot">
              <div className="camera-loading-content">
                <span className="camera-loading-spinner" aria-hidden="true" />
                <span>Booting the camera</span>
              </div>
            </div>
          )}
          {!loading && !(typeof countdown === 'number' && countdown > 0) && (
            <div className="camera-status camera-status-loading">
              <div className="camera-loading-content">
                <span className="camera-loading-spinner" aria-hidden="true" />
                <span>Waiting for native preview…</span>
              </div>
            </div>
          )}
          {errorMessage && (
            <div className="camera-status camera-status-error">
              <div className="camera-error-content">
                <strong>Mirror camera unavailable.</strong>
                <span>{errorMessage}</span>
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
