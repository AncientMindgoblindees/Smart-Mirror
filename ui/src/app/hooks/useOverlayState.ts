import { useState } from 'react';

export function useOverlayState() {
  const [showCamera, setShowCamera] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  return {
    showCamera,
    setShowCamera,
    cameraError,
    setCameraError,
  };
}
