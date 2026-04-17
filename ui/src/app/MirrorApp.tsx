import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import {
  WidgetFrame,
  useWidgetPersistence,
  DEV_PANEL_STORAGE_KEY,
} from '@/features/widgets';
import { ToolsPanel } from '@/features/dev-panel';
import { CameraOverlay } from '@/features/camera';
import {
  DeviceConnectionOverlay,
  useDeviceConnectionState,
} from '@/features/connection';
import { AuthQROverlay, useAuthState } from '@/features/auth';
import { useControlEvents } from '@/hooks/useControlEvents';
import { useMirrorInput } from '@/hooks/useMirrorInput';
import { useTimeOfDay } from '@/hooks/useTimeOfDay';
import { useParallax } from '@/hooks/useParallax';
import { TooltipProvider } from '@/components/ui/Tooltip';
import { useMirrorDisplayMode } from './hooks/useMirrorDisplayMode';
import { useAuthActions } from './hooks/useAuthActions';
import { useOverlayState } from './hooks/useOverlayState';
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
  const { showCamera, setShowCamera, cameraCountdown, setCameraCountdown, cameraError, setCameraError } =
    useOverlayState();
  const [showDevPanel, setShowDevPanel] = useState(readDevPanelInitial);
  const [fullScreenTryOnUrl, setFullScreenTryOnUrl] = useState<string | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasRect, setCanvasRect] = useState<DOMRect | null>(null);
  const { sleepMode, sleepModeRef, toggleDim, toggleSleep } = useMirrorDisplayMode();

  const {
    connectionState,
    handlers: deviceHandlers,
    retry: retryConnection,
  } = useDeviceConnectionState();

  const {
    providers: authProviders,
    pendingAuth,
    initiateLogin,
    cancelPendingAuth,
    disconnectProvider,
    refresh: refreshAuth,
  } = useAuthState();
  const {
    authError,
    signInGoogle,
    signInMicrosoft,
    disconnectGoogle,
    disconnectMicrosoft,
  } = useAuthActions(initiateLogin, disconnectProvider);

  useTimeOfDay();
  const parallax = useParallax();

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const updateRect = () => setCanvasRect(el.getBoundingClientRect());
    updateRect();
    const ro = new ResizeObserver(updateRect);
    ro.observe(el);
    return () => ro.disconnect();
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

  useMirrorInput({
    toggleDim,
    toggleSleep,
    toggleDevPanel,
    dismissTryOnOverlay: () => setFullScreenTryOnUrl(null),
    getSleepMode: () => sleepModeRef.current,
  });

  useControlEvents({
    onCameraCountdownStarted: (seconds) => {
      setShowCamera(true);
      setCameraCountdown(seconds);
      setCameraError(null);
    },
    onCameraCountdownTick: (remaining) => {
      setShowCamera(true);
      setCameraCountdown(remaining);
    },
    onCameraCaptured: () => {
      setCameraCountdown(null);
      setCameraError(null);
      setShowCamera(false);
    },
    onCameraError: (message) => {
      setCameraCountdown(null);
      setShowCamera(true);
      setCameraError(message);
    },
    onTryOnResult: (payload) => {
      if (payload.image_url) setFullScreenTryOnUrl(payload.image_url);
    },
    ...deviceHandlers,
    onAuthStateChanged: () => {
      refreshAuth();
    },
  });

  const toggleWidget = (id: string) => {
    setWidgets((prev) => prev.map((w) => (w.id === id ? { ...w, enabled: !w.enabled } : w)));
  };

  const visibleWidgets = useMemo(() => widgets.filter((w) => w.enabled), [widgets]);

  return (
    <TooltipProvider delayDuration={400}>
      <div className="mirror-shell">
        <div className="mirror-ambient-layer" aria-hidden="true" />

      <motion.div
        ref={canvasRef}
        className="mirror-canvas mirror-canvas-freeform"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
        style={{
          transform: `translate3d(${parallax.x * 0.3}px, ${parallax.y * 0.3}px, 0)`,
        }}
      >
        <AnimatePresence mode="popLayout">
          {visibleWidgets.map((w) => (
            <WidgetFrame key={w.id} config={w} canvasRect={canvasRect} />
          ))}
        </AnimatePresence>
      </motion.div>

      {showDevPanel && (
        <ToolsPanel
          onToggleCamera={() => setShowCamera((v) => !v)}
          onToggleDim={toggleDim}
          onToggleSleep={toggleSleep}
          widgets={widgets}
          onToggleWidget={toggleWidget}
          authProviders={authProviders}
          authPending={Boolean(pendingAuth)}
          authError={authError}
          onSignInGoogle={signInGoogle}
          onSignInMicrosoft={signInMicrosoft}
          onDisconnectGoogle={disconnectGoogle}
          onDisconnectMicrosoft={disconnectMicrosoft}
        />
      )}

      {showCamera && (
        <CameraOverlay
          countdown={cameraCountdown}
          errorMessage={cameraError}
          onClose={() => {
            setCameraCountdown(null);
            setCameraError(null);
            setShowCamera(false);
          }}
        />
      )}

      <AnimatePresence>
        {fullScreenTryOnUrl && (
          <motion.div
            className="camera-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="camera-stage">
              <div className="camera-video-wrap">
                <img
                  src={fullScreenTryOnUrl}
                  className="camera-video"
                  aria-label="Full-screen virtual try-on result"
                  referrerPolicy="no-referrer"
                />
              </div>
              <button
                type="button"
                className="camera-exit-btn"
                onClick={() => setFullScreenTryOnUrl(null)}
              >
                <X size={20} /> Hide Try-On
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <DeviceConnectionOverlay
        state={connectionState}
        onRetry={retryConnection}
      />

      <AuthQROverlay
        pendingAuth={pendingAuth}
        onCancel={() => {
          void cancelPendingAuth();
        }}
      />

      <AnimatePresence>
        {sleepMode && (
          <motion.div
            className="mirror-sleep-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
            aria-hidden="true"
          >
            <motion.span
              className="mirror-sleep-hint"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8, duration: 1, ease: [0.16, 1, 0.3, 1] }}
            >
              Sleep — tap or press any key to wake
            </motion.span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
    </TooltipProvider>
  );
}
