import React from 'react';
import { X } from 'lucide-react';
import { useCameraStream } from './useCameraStream';
import './camera-overlay.css';

export const CameraOverlay: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { camera, videoRef, stopTracks } = useCameraStream();

  const handleClose = () => {
    stopTracks();
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
        <button type="button" className="camera-exit-btn" onClick={handleClose}>
          <X size={20} /> Exit Camera
        </button>
      </div>
    </div>
  );
};
