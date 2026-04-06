import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  WidgetFrame,
  useWidgetPersistence,
  DEV_PANEL_STORAGE_KEY,
} from '@/features/widgets';
import { ToolsPanel } from '@/features/dev-panel';
import { CameraOverlay } from '@/features/camera';
import { useControlEvents } from '@/hooks/useControlEvents';
import { useMirrorInput } from '@/hooks/useMirrorInput';
import './mirror-app.css';

function readDevPanelInitial(): boolean {
  try {
    const v = localStorage.getItem(DEV_PANEL_STORAGE_KEY);
    if (v === 'false') return false;
  } catch {
    /* ignore */
  }
  return true;
}

export default function MirrorApp() {
  const { widgets, setWidgets } = useWidgetPersistence();
  const [showCamera, setShowCamera] = useState(false);
  const [cameraCountdown, setCameraCountdown] = useState<number | null>(null);
  const [displayDimmed, setDisplayDimmed] = useState(false);
  const [sleepMode, setSleepMode] = useState(false);
  const [showDevPanel, setShowDevPanel] = useState(readDevPanelInitial);

  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasRect, setCanvasRect] = useState<DOMRect | null>(null);
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

  useEffect(() => {
    const updateRect = () => {
      if (canvasRef.current) setCanvasRect(canvasRef.current.getBoundingClientRect());
    };
    updateRect();
    window.addEventListener('resize', updateRect);
    return () => window.removeEventListener('resize', updateRect);
  }, []);

  const toggleDevPanel = useCallback(() => {
    setShowDevPanel((v) => {
      const next = !v;
      try {
        localStorage.setItem(DEV_PANEL_STORAGE_KEY, String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const toggleDim = useCallback(() => {
    setDisplayDimmed((d) => !d);
  }, []);

  const toggleSleep = useCallback(() => {
    setSleepMode((s) => !s);
  }, []);

  useMirrorInput({
    toggleDim,
    toggleSleep,
    toggleDevPanel,
    getSleepMode: () => sleepModeRef.current,
  });

  useControlEvents({
    onCameraCountdownStarted: (seconds) => {
      setShowCamera(true);
      setCameraCountdown(seconds);
    },
    onCameraCountdownTick: (remaining) => {
      setShowCamera(true);
      setCameraCountdown(remaining);
    },
    onCameraCaptured: () => {
      setCameraCountdown(null);
    },
    onCameraError: () => {
      setCameraCountdown(null);
    },
  });

  const toggleWidget = (id: string) => {
    setWidgets((prev) => prev.map((w) => (w.id === id ? { ...w, enabled: !w.enabled } : w)));
  };

  const visibleWidgets = useMemo(() => widgets.filter((w) => w.enabled), [widgets]);

  return (
    <div className="mirror-shell">
      <div ref={canvasRef} className="mirror-canvas mirror-canvas-freeform">
        {visibleWidgets.map((w) => (
          <WidgetFrame key={w.id} config={w} canvasRect={canvasRect} />
        ))}
      </div>

      {showDevPanel && (
        <ToolsPanel
          onToggleCamera={() => setShowCamera((v) => !v)}
          onToggleDim={toggleDim}
          onToggleSleep={toggleSleep}
          widgets={widgets}
          onToggleWidget={toggleWidget}
        />
      )}

      {showCamera && (
        <CameraOverlay
          countdown={cameraCountdown}
          onClose={() => {
            setCameraCountdown(null);
            setShowCamera(false);
          }}
        />
      )}

      {sleepMode && (
        <div className="mirror-sleep-overlay" aria-hidden="true">
          <span className="mirror-sleep-hint">Sleep — press any key to wake</span>
        </div>
      )}
    </div>
  );
}
