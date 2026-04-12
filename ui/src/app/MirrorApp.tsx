import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { AnimatePresence, motion } from 'motion/react';
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
  const [authError, setAuthError] = useState<string | null>(null);

  useTimeOfDay();
  const parallax = useParallax();

  useEffect(() => {
    document.body.classList.toggle('mirror-display-dimmed', displayDimmed && !sleepMode);
    return () => document.body.classList.remove('mirror-display-dimmed');
  }, [displayDimmed, sleepMode]);

  useEffect(() => {
    document.body.classList.toggle('mirror-sleep', sleepMode);
    return () => document.body.classList.remove('mirror-sleep');
  }, [sleepMode]);

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
          onSignInGoogle={async () => {
            setAuthError(null);
            try {
              await initiateLogin('google');
            } catch (e) {
              setAuthError(e instanceof Error ? e.message : 'Google sign-in failed');
            }
          }}
          onSignInMicrosoft={async () => {
            setAuthError(null);
            try {
              await initiateLogin('microsoft');
            } catch (e) {
              setAuthError(e instanceof Error ? e.message : 'Microsoft sign-in failed');
            }
          }}
          onDisconnectGoogle={async () => {
            setAuthError(null);
            await disconnectProvider('google');
          }}
          onDisconnectMicrosoft={async () => {
            setAuthError(null);
            await disconnectProvider('microsoft');
          }}
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
