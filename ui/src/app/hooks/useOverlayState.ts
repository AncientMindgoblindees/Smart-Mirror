import { useState } from 'react';

export function useOverlayState() {
  const [showCamera, setShowCamera] = useState(false);
  const [cameraCountdown, setCameraCountdown] = useState<number | null>(null);

  return {
    showCamera,
    setShowCamera,
    cameraCountdown,
    setCameraCountdown,
  };
}
