import React from 'react';
import { X } from 'lucide-react';
import './camera-overlay.css';

export const CameraOverlay: React.FC<{
  onClose: () => void;
  errorMessage?: string | null;
}> = ({
  onClose,
  errorMessage = null,
}) => {
  return (
    <div className="camera-overlay">
      <div className="camera-stage">
        <div className="camera-video-wrap">
          <div className="camera-native-preview-hint" aria-live="polite">
            Native camera preview is running.
          </div>
          {errorMessage && (
            <div className="camera-status camera-status-error">
              <div className="camera-error-content">
                <strong>Mirror camera unavailable.</strong>
                <span>{errorMessage}</span>
              </div>
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
