import { useCallback, useEffect, useRef, useState } from 'react';

export function useMirrorDisplayMode() {
  const [displayDimmed, setDisplayDimmed] = useState(false);
  const [sleepMode, setSleepMode] = useState(false);
  const sleepModeRef = useRef(false);
  sleepModeRef.current = sleepMode;

  useEffect(() => {
    document.body.classList.toggle('mirror-display-dimmed', displayDimmed && !sleepMode);
    return () => document.body.classList.remove('mirror-display-dimmed');
  }, [displayDimmed, sleepMode]);

  useEffect(() => {
    document.body.classList.toggle('mirror-sleep', sleepMode);
    return () => document.body.classList.remove('mirror-sleep');
  }, [sleepMode]);

  const toggleDim = useCallback(() => setDisplayDimmed((d) => !d), []);
  const toggleSleep = useCallback(() => setSleepMode((s) => !s), []);

  return { displayDimmed, sleepMode, sleepModeRef, toggleDim, toggleSleep, setSleepMode };
}
