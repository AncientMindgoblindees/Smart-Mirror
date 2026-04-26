import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Camera, Palette, Moon, Power, QrCode, Shuffle, X } from 'lucide-react';
import { getUserSettings, putUserSettings, triggerCameraCapture } from '@/api/mirrorApi';
import { applyUserSettings } from '@/userSettings';
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
import { useMenuNavigation } from '@/hooks/useMenuNavigation';
import { useTimeOfDay } from '@/hooks/useTimeOfDay';
import { useParallax } from '@/hooks/useParallax';
import { TooltipProvider } from '@/components/ui/Tooltip';
import { MenuOverlay, type MenuItem } from '@/components/MenuOverlay';
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

const MENU_ITEMS: MenuItem[] = [
  { id: 'take_picture', label: 'Take Picture', icon: Camera },
  { id: 'randomize_widgets', label: 'Randomize Widgets', icon: Shuffle },
  { id: 'change_theme', label: 'Change Theme', icon: Palette },
  { id: 'link_google_qr', label: 'Link Google (QR)', icon: QrCode },
  { id: 'sleep', label: 'Sleep', icon: Moon },
  { id: 'power_down', label: 'Power Down', icon: Power },
  { id: 'exit', label: 'Exit', icon: X },
];
const MENU_ACTION_IDS = MENU_ITEMS.map((item) => item.id);

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
  const {
    displayDimmed,
    sleepMode,
    sleepModeRef,
    toggleDim,
    toggleSleep,
    setSleepMode,
  } = useMirrorDisplayMode();

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
    setAuthError,
    signInGoogle,
    disconnectGoogle,
  } = useAuthActions(initiateLogin, disconnectProvider);

  useTimeOfDay();
  const parallax = useParallax();
  const logMenu = useCallback(
    (
      event: string,
      details?: Record<string, unknown> | string,
      level: 'info' | 'warn' | 'error' = 'info',
    ) => {
      const payload = {
        at: new Date().toISOString(),
        event,
        ...(typeof details === 'string' ? { message: details } : details ?? {}),
      };
      const out = `[mirror-menu] ${payload.event}`;
      if (level === 'warn') {
        console.warn(out, payload);
        return;
      }
      if (level === 'error') {
        console.error(out, payload);
        return;
      }
      console.info(out, payload);
    },
    [],
  );
  const randomizeWidgets = useCallback(() => {
    setWidgets((prev) =>
      prev.map((w, index) => {
        const width = Math.min(96, Math.max(6, w.freeform.width));
        const height = Math.min(96, Math.max(6, w.freeform.height));
        const maxX = Math.max(0, 100 - width);
        const maxY = Math.max(0, 100 - height);
        const seed = Math.random() * (index + 1);
        const x = Number((Math.random() * maxX).toFixed(2));
        const y = Number((Math.random() * maxY).toFixed(2));
        return {
          ...w,
          freeform: {
            ...w.freeform,
            x,
            y,
            width,
            height,
          },
          grid: {
            ...w.grid,
            row: Math.max(0, Math.floor((y / 100) * 12)),
            col: Math.max(0, Math.floor((x / 100) * 12 + (seed % 1))),
          },
        };
      }),
    );
  }, [setWidgets]);
  const handleMenuAction = useCallback(
    (actionId: string) => {
      logMenu('action_invoked', { actionId });
      if (actionId === 'exit') {
        closeMenuRef.current();
        return;
      }
      if (actionId === 'take_picture') {
        closeMenuRef.current();
        logMenu('take_picture_started', { source: 'mirror-menu' });
        setShowCamera(true);
        setCameraError(null);
        void triggerCameraCapture({
          countdown_seconds: 3,
          source: 'mirror-menu',
          session_id: `menu-${Date.now()}`,
        })
          .then((result) => {
            logMenu('take_picture_accepted', { result });
          })
          .catch((error: unknown) => {
            const message = error instanceof Error ? error.message : 'Unknown error';
            setCameraError(summarizeCameraError(message));
            logMenu('take_picture_failed', { message }, 'error');
          });
        return;
      }
      if (actionId === 'randomize_widgets') {
        randomizeWidgets();
        logMenu('widgets_randomized', { count: widgets.length });
        return;
      }
      if (actionId === 'change_theme') {
        void (async () => {
          try {
            const settings = await getUserSettings();
            const nextTheme = settings.theme === 'light' ? 'dark' : 'light';
            const updated = await putUserSettings({ theme: nextTheme });
            applyUserSettings(updated);
            logMenu('theme_changed', { from: settings.theme, to: updated.theme });
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            logMenu('theme_change_failed', { message }, 'error');
          }
        })();
        return;
      }
      if (actionId === 'link_google_qr') {
        closeMenuRef.current();
        setAuthError(null);
        logMenu('google_qr_link_started', { source: 'mirror-menu' });
        void initiateLogin('google')
          .then(() => {
            logMenu('google_qr_link_prompted', { source: 'mirror-menu' });
          })
          .catch((error: unknown) => {
            const message = error instanceof Error ? error.message : 'Unknown error';
            setAuthError(message);
            logMenu('google_qr_link_failed', { message }, 'error');
          });
        return;
      }
      if (actionId === 'sleep') {
        closeMenuRef.current();
        setSleepMode(true);
        logMenu('sleep_enabled', { source: 'mirror-menu' });
        return;
      }
      if (actionId === 'power_down') {
        closeMenuRef.current();
        if (!displayDimmed) toggleDim();
        setSleepMode(true);
        logMenu(
          'power_down_requested',
          {
            mode: 'simulated',
            behavior: 'display_dimmed_and_sleep_enabled',
          },
          'warn',
        );
        return;
      }
      logMenu('action_unhandled', { actionId }, 'warn');
    },
    [
      displayDimmed,
      logMenu,
      randomizeWidgets,
      initiateLogin,
      setAuthError,
      setCameraError,
      setShowCamera,
      setSleepMode,
      toggleDim,
      widgets.length,
    ],
  );
  const closeMenuRef = useRef<() => void>(() => {});
  const menuNavigation = useMenuNavigation({
    actionIds: MENU_ACTION_IDS,
    onAction: handleMenuAction,
  });
  closeMenuRef.current = menuNavigation.close;
  const prevMenuOpenRef = useRef<boolean>(false);
  useEffect(() => {
    if (prevMenuOpenRef.current !== menuNavigation.isOpen) {
      logMenu(menuNavigation.isOpen ? 'menu_opened' : 'menu_closed', {
        activeIndex: menuNavigation.activeIndex,
      });
      prevMenuOpenRef.current = menuNavigation.isOpen;
    }
  }, [logMenu, menuNavigation.activeIndex, menuNavigation.isOpen]);
  const prevActiveIndexRef = useRef<number>(menuNavigation.activeIndex);
  useEffect(() => {
    if (!menuNavigation.isOpen) return;
    if (prevActiveIndexRef.current !== menuNavigation.activeIndex) {
      logMenu('cursor_moved', {
        activeIndex: menuNavigation.activeIndex,
        actionId: MENU_ACTION_IDS[menuNavigation.activeIndex],
      });
      prevActiveIndexRef.current = menuNavigation.activeIndex;
    }
  }, [logMenu, menuNavigation.activeIndex, menuNavigation.isOpen]);

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
    isInputBlocked: () => menuNavigation.isOpen,
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
          onDisconnectGoogle={disconnectGoogle}
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

      <MenuOverlay
        isOpen={menuNavigation.isOpen}
        activeIndex={menuNavigation.activeIndex}
        items={MENU_ITEMS}
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
