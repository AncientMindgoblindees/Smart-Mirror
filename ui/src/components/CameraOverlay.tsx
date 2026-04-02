import React from 'react';
import { X } from 'lucide-react';

export const CameraOverlay: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <div className="camera-overlay">
    <div className="camera-stage">
      <div className="video-placeholder">
        <div className="status-line">Camera offline • No signal</div>
      </div>
      <button type="button" className="exit-btn" onClick={onClose}>
        <X size={20} /> Exit Camera
      </button>
    </div>
  </div>
);
