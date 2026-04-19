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
import { getApiBase } from '@/config/backendOrigin';
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

function summarizeCameraError(message: string): string {
  const raw = (message || '').trim();
  if (!raw) return 'Camera error';
  const busyHint = /resource busy|pipeline handler in use|failed to acquire camera/i.test(raw);
  if (!busyHint) {
    return raw.slice(0, 280);
  }
  const mediaMatch = raw.match(/holders-[a-z]+\.holders_media=([^|]+)/i);
  const backendMatch = raw.match(/holders-[a-z]+\.holders_backend=([^|]+)/i);
  const media = mediaMatch?.[1]?.trim();
  const backend = backendMatch?.[1]?.trim();
  const mediaText = media && media !== 'none' ? `media: ${media.slice(0, 180)}` : '';
  const backendText = backend && backend !== 'none' ? `backend: ${backend.slice(0, 180)}` : '';
  const details = [mediaText, backendText].filter(Boolean).join(' | ');
  if (details) return `Camera busy (${details})`;
  return 'Camera busy (owned by another process)';
}

export default function MirrorApp() {
  const { widgets, setWidgets } = useWidgetPersistence();
  const {
    showCamera,
    setShowCamera,
    cameraError,
    setCameraError,
  } =
    useOverlayState();
  const captureFlowActiveRef = useRef(false);
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

  const startDevNativePreview = useCallback(async () => {
    const res = await fetch(`${getApiBase()}/camera/preview/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'mirror-dev-panel' }),
    });
    if (!res.ok) {
      const payload = (await res.json().catch(() => ({}))) as { detail?: string };
      throw new Error(payload.detail || `Preview start failed (${res.status})`);
    }
  }, []);

  const stopDevNativePreview = useCallback(async () => {
    await fetch(`${getApiBase()}/camera/preview/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'mirror-dev-panel' }),
    }).catch(() => {});
  }, []);

  useMirrorInput({
    toggleDim,
    toggleSleep,
    toggleDevPanel,
    dismissTryOnOverlay: () => setFullScreenTryOnUrl(null),
    getSleepMode: () => sleepModeRef.current,
  });

  useControlEvents({
    onCameraLoadingStarted: () => {
      captureFlowActiveRef.current = true;
      setShowCamera(true);
      setCameraError(null);
    },
    onCameraLoadingReady: () => {
      setShowCamera(true);
      setCameraError(null);
    },
    onCameraCountdownStarted: () => {
      captureFlowActiveRef.current = true;
      setShowCamera(true);
      setCameraError(null);
    },
    onCameraCountdownTick: () => {
      captureFlowActiveRef.current = true;
      setShowCamera(true);
    },
    onCameraCaptured: () => {
      captureFlowActiveRef.current = false;
      setCameraError(null);
      setShowCamera(false);
    },
    onCameraError: (message) => {
      const hadCaptureFlow = captureFlowActiveRef.current;
      captureFlowActiveRef.current = false;
      setCameraError(summarizeCameraError(message));
      // If this error happened during an active capture flow, return to UI instead of leaving camera overlay stuck.
      if (hadCaptureFlow) {
        setShowCamera(false);
        return;
      }
      setShowCamera(true);
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
          onToggleCamera={() => {
            const shouldOpen = !showCamera;
            if (shouldOpen) {
              setShowCamera(true);
              setCameraError(null);
              void startDevNativePreview()
                .catch((err: unknown) => {
                  setCameraError(err instanceof Error ? err.message : 'Native preview failed to start');
                });
              return;
            }
            setCameraError(null);
            setShowCamera(false);
            void stopDevNativePreview();
          }}
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
          errorMessage={cameraError}
          onClose={() => {
            setCameraError(null);
            setShowCamera(false);
            void stopDevNativePreview();
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
