import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import {
  CheckCircle2,
  Link2,
  RefreshCw,
  Sparkles,
  UserCircle2,
  UserPlus,
  Waves,
  X,
  type LucideIcon,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

import type { MirrorProfile, UserSettingsOut, WidgetConfigOut } from '@/api/backendTypes';
import { TooltipProvider } from '@/components/ui/Tooltip';
import { CameraOverlay } from '@/features/camera';
import { DeviceConnectionOverlay, useDeviceConnectionState } from '@/features/connection';
import { SPRING_SNAPPY, SPRING_SOFT } from '@/features/connection/motionPresets';
import { ToolsPanel } from '@/features/dev-panel';
import { DEV_PANEL_STORAGE_KEY, WidgetFrame, useWidgetPersistence } from '@/features/widgets';
import { useControlEvents } from '@/hooks/useControlEvents';
import { type MirrorButtonInput, useMirrorInput } from '@/hooks/useMirrorInput';
import { useParallax } from '@/hooks/useParallax';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useTimeOfDay } from '@/hooks/useTimeOfDay';
import { getApiBase } from '@/config/backendOrigin';
import { useAuthState } from '@/features/auth';
import { useAuthActions } from './hooks/useAuthActions';
import { useMirrorDisplayMode } from './hooks/useMirrorDisplayMode';
import { useMirrorSession } from './hooks/useMirrorSession';
import { useOverlayState } from './hooks/useOverlayState';
import './mirror-app.css';

type OverlayView = 'identity' | 'system';
type IdentityIntent = 'activate' | 'pair' | 'create';
type IdentitySubstate = 'list' | 'pairing';
type AnimationMode = 'aurora' | 'pulse' | 'drift';
type SystemAction = 'profiles' | 'google' | 'guest' | 'animation' | 'refresh' | 'resume';

type SystemMenuItem = {
  id: SystemAction;
  label: string;
  helper: string;
  status: string;
  icon: LucideIcon;
};

const NATURAL_ACCENT = '#E6D5B8';
const PROFILE_TONES = ['#5F5042', '#75624F', '#8D755C', '#6A6F5A', '#59665C', '#6A5B52'];

const ANIMATION_PRESETS: Array<{
  id: AnimationMode;
  title: string;
  description: string;
}> = [
  { id: 'aurora', title: 'Aurora Flow', description: 'Soft drifting gradients with a calm glass glow.' },
  { id: 'pulse', title: 'Pulse Grid', description: 'Sharper highlights and a rhythmic scan-line bloom.' },
  { id: 'drift', title: 'Orbit Drift', description: 'Slow orbital motion with a cinematic floating feel.' },
];

function readDevPanelInitial(): boolean {
  try {
    const value = localStorage.getItem(DEV_PANEL_STORAGE_KEY);
    if (value === 'false') return false;
  } catch {
    /* ignore */
  }
  return true;
}

function readAnimationInitial(): AnimationMode {
  try {
    const stored = window.localStorage.getItem('smart-mirror.animation-mode');
    if (stored === 'pulse' || stored === 'drift') return stored;
  } catch {
    /* ignore */
  }
  return 'aurora';
}

function summarizeCameraError(message: string): string {
  const raw = (message || '').trim();
  if (!raw) return 'Camera error';
  const busyHint = /resource busy|pipeline handler in use|failed to acquire camera/i.test(raw);
  if (!busyHint) return raw.slice(0, 280);
  const mediaMatch = raw.match(/holders-[a-z]+\.holders_media=([^|]+)/i);
  const backendMatch = raw.match(/holders-[a-z]+\.holders_backend=([^|]+)/i);
  const media = mediaMatch?.[1]?.trim();
  const backend = backendMatch?.[1]?.trim();
  const mediaText = media && media !== 'none' ? `media: ${media.slice(0, 180)}` : '';
  const backendText = backend && backend !== 'none' ? `backend: ${backend.slice(0, 180)}` : '';
  const details = [mediaText, backendText].filter(Boolean).join(' | ');
  return details ? `Camera busy (${details})` : 'Camera busy (owned by another process)';
}

function profileLabel(profile: MirrorProfile): string {
  return profile.display_name?.trim() || profile.user_id;
}

function nextIndex(current: number, delta: number, length: number): number {
  if (length <= 0) return 0;
  return (current + delta + length) % length;
}

function createPendingAccountUserId(): string {
  return `google-user-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}

function profileInitials(profile: MirrorProfile): string {
  const label = profileLabel(profile).trim();
  const [first = '', second = ''] = label.split(/\s+/);
  const initials = `${first[0] ?? ''}${second[0] ?? ''}`.trim();
  return (initials || label.slice(0, 2)).toUpperCase();
}

function avatarTone(index: number): string {
  return PROFILE_TONES[index % PROFILE_TONES.length] ?? PROFILE_TONES[0];
}

function legendDot(active: boolean) {
  return (
    <span
      className={`inline-flex h-2.5 w-2.5 rounded-full border ${
        active ? 'border-transparent bg-[#E6D5B8] shadow-[0_0_18px_rgba(230,213,184,0.8)]' : 'border-white/35 bg-transparent'
      }`}
      aria-hidden="true"
    />
  );
}

function FooterLegend() {
  return (
    <div className="flex items-center justify-center gap-6 text-[10px] uppercase tracking-[0.28em] text-white/50">
      <div className="flex items-center gap-2">
        {legendDot(false)}
        <span>Previous</span>
      </div>
      <div className="flex items-center gap-2 text-white/80">
        {legendDot(true)}
        <span>Select</span>
      </div>
      <div className="flex items-center gap-2">
        {legendDot(false)}
        <span>Next</span>
      </div>
    </div>
  );
}

function SystemMenuRow({
  item,
  active,
  onClick,
}: {
  item: SystemMenuItem;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;

  return (
    <motion.button
      type="button"
      layout
      transition={SPRING_SNAPPY}
      onClick={onClick}
      className="relative w-full overflow-hidden rounded-[24px] border border-white/8 bg-white/[0.02] px-4 py-4 text-left"
      animate={{
        y: active ? -2 : 0,
        scale: active ? 1.01 : 1,
        backgroundColor: active ? 'rgba(230, 213, 184, 0.08)' : 'rgba(255, 255, 255, 0.02)',
        borderColor: active ? 'rgba(230, 213, 184, 0.55)' : 'rgba(255, 255, 255, 0.08)',
      }}
    >
      {active && (
        <motion.span
          layoutId="system-menu-selection"
          className="absolute inset-0 rounded-[24px] border border-[#E6D5B8]/70 bg-[#E6D5B8]/10"
          transition={SPRING_SNAPPY}
        />
      )}
      <div className="relative z-10 flex items-center gap-4">
        <motion.div
          className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/8 bg-white/6"
          animate={{
            scale: active ? 1.08 : 1,
            opacity: active ? 1 : 0.5,
            color: active ? '#FFFFFF' : 'rgba(255,255,255,0.55)',
          }}
          transition={SPRING_SNAPPY}
        >
          <Icon size={28} />
        </motion.div>
        <motion.span
          className="flex-1 text-[18px] leading-none"
          animate={{ opacity: active ? 1 : 0.58, color: active ? '#FFFFFF' : 'rgba(255,255,255,0.85)' }}
          transition={SPRING_SOFT}
        >
          {item.label}
        </motion.span>
        <motion.span
          className="rounded-full px-3 py-1 text-[12px] font-medium uppercase tracking-[0.18em]"
          animate={{
            opacity: active ? 1 : 0.75,
            backgroundColor: active ? NATURAL_ACCENT : 'rgba(255,255,255,0.08)',
            color: active ? '#1F170F' : 'rgba(255,255,255,0.65)',
          }}
          transition={SPRING_SOFT}
        >
          {item.status}
        </motion.span>
      </div>
    </motion.button>
  );
}

function IdentityTile({
  profile,
  index,
  active,
  live,
  googleConnected,
  onClick,
}: {
  profile: MirrorProfile;
  index: number;
  active: boolean;
  live: boolean;
  googleConnected: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      layout
      transition={SPRING_SNAPPY}
      onClick={onClick}
      className="relative w-full overflow-hidden rounded-[28px] border border-white/8 bg-white/[0.02] px-4 py-4 text-left"
      animate={{
        y: active ? -2 : 0,
        backgroundColor: active ? 'rgba(230, 213, 184, 0.08)' : 'rgba(255, 255, 255, 0.02)',
        borderColor: active ? 'rgba(230, 213, 184, 0.55)' : 'rgba(255, 255, 255, 0.08)',
      }}
    >
      {active && (
        <motion.span
          layoutId="identity-selection"
          className="absolute inset-0 rounded-[28px] border border-[#E6D5B8]/70 bg-[#E6D5B8]/10"
          transition={SPRING_SNAPPY}
        />
      )}
      <div className="relative z-10 flex items-center gap-4">
        <motion.div
          className="flex h-12 w-12 items-center justify-center rounded-full text-sm font-semibold text-white"
          animate={{ scale: active ? 1.1 : 1, opacity: active ? 1 : 0.78 }}
          transition={SPRING_SNAPPY}
          style={{ backgroundColor: avatarTone(index) }}
        >
          {profileInitials(profile)}
        </motion.div>
        <div className="min-w-0 flex-1">
          <motion.div
            className="truncate text-[17px] leading-none"
            animate={{ opacity: active ? 1 : 0.82 }}
            transition={SPRING_SOFT}
          >
            {profileLabel(profile)}
          </motion.div>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.18em] text-white/45">
            <span>{profile.user_id}</span>
            {live && <span className="text-white/70">Live</span>}
            {googleConnected && <span className="text-[#E6D5B8]">Google</span>}
          </div>
        </div>
      </div>
    </motion.button>
  );
}

function CreateAccountTile({
  active,
  onClick,
}: {
  active: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      layout
      transition={SPRING_SNAPPY}
      onClick={onClick}
      className="relative w-full overflow-hidden rounded-[28px] border border-white/8 bg-white/[0.02] px-4 py-5 text-left"
      animate={{
        y: active ? -2 : 0,
        backgroundColor: active ? 'rgba(230, 213, 184, 0.08)' : 'rgba(255, 255, 255, 0.02)',
        borderColor: active ? 'rgba(230, 213, 184, 0.55)' : 'rgba(255, 255, 255, 0.08)',
      }}
    >
      {active && (
        <motion.span
          layoutId="identity-selection"
          className="absolute inset-0 rounded-[28px] border border-[#E6D5B8]/70 bg-[#E6D5B8]/10"
          transition={SPRING_SNAPPY}
        />
      )}
      <div className="relative z-10 flex items-center gap-4">
        <motion.div
          className="flex h-12 w-12 items-center justify-center rounded-full bg-[#6B5E52] text-white"
          animate={{ scale: active ? 1.1 : 1, opacity: active ? 1 : 0.78 }}
          transition={SPRING_SNAPPY}
        >
          <UserPlus size={24} />
        </motion.div>
        <div className="min-w-0 flex-1">
          <motion.div className="text-[17px] leading-none" animate={{ opacity: active ? 1 : 0.82 }} transition={SPRING_SOFT}>
            Create Account
          </motion.div>
          <div className="mt-2 text-[11px] uppercase tracking-[0.18em] text-white/45">Scan QR and link Google profile</div>
        </div>
      </div>
    </motion.button>
  );
}

type DashboardProps = {
  hardwareId: string;
  activeProfile: MirrorProfile;
  syncWidgets: WidgetConfigOut[] | null;
  syncUserSettings: UserSettingsOut | null;
  showDevPanel: boolean;
  toggleDim: () => void;
  toggleSleep: () => void;
  fullScreenTryOnUrl: string | null;
  setFullScreenTryOnUrl: React.Dispatch<React.SetStateAction<string | null>>;
  authProviders: ReturnType<typeof useAuthState>['providers'];
  pendingAuth: ReturnType<typeof useAuthState>['pendingAuth'];
  authError: string | null;
  signInGoogle: () => void | Promise<void>;
  disconnectGoogle: () => void | Promise<void>;
  refreshAuth: () => Promise<void>;
};

function MirrorDashboard({
  hardwareId,
  activeProfile,
  syncWidgets,
  syncUserSettings,
  showDevPanel,
  toggleDim,
  toggleSleep,
  fullScreenTryOnUrl,
  setFullScreenTryOnUrl,
  authProviders,
  pendingAuth,
  authError,
  signInGoogle,
  disconnectGoogle,
  refreshAuth,
}: DashboardProps) {
  const reducedMotion = useReducedMotion();
  const { widgets, setWidgets } = useWidgetPersistence({
    refreshKey: `${hardwareId}:${activeProfile.user_id}`,
    initialWidgets: syncWidgets,
    initialUserSettings: syncUserSettings,
  });
  const { showCamera, setShowCamera, cameraError, setCameraError } = useOverlayState();
  const captureFlowActiveRef = useRef(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasRect, setCanvasRect] = useState<DOMRect | null>(null);
  const { connectionState, handlers: deviceHandlers, retry: retryConnection } = useDeviceConnectionState();
  const parallax = useParallax(!reducedMotion);

  useEffect(() => {
    const element = canvasRef.current;
    if (!element) return;
    const updateRect = () => setCanvasRect(element.getBoundingClientRect());
    updateRect();
    const observer = new ResizeObserver(updateRect);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const startDevNativePreview = async () => {
    const response = await fetch(`${getApiBase()}/camera/preview/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'mirror-dev-panel' }),
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { detail?: string };
      throw new Error(payload.detail || `Preview start failed (${response.status})`);
    }
  };

  const stopDevNativePreview = async () => {
    await fetch(`${getApiBase()}/camera/preview/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'mirror-dev-panel' }),
    }).catch(() => {});
  };

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
      void refreshAuth();
    },
  });

  const toggleWidget = (id: string) => {
    setWidgets((previous) =>
      previous.map((widget) => (widget.id === id ? { ...widget, enabled: !widget.enabled } : widget)),
    );
  };

  const visibleWidgets = useMemo(() => widgets.filter((widget) => widget.enabled), [widgets]);

  return (
    <>
      <motion.div
        ref={canvasRef}
        className="mirror-canvas mirror-canvas-freeform"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={reducedMotion ? { duration: 0 } : { duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
        style={{
          transform: reducedMotion ? undefined : `translate3d(${parallax.x * 0.3}px, ${parallax.y * 0.3}px, 0)`,
        }}
      >
        <AnimatePresence mode="popLayout">
          {visibleWidgets.map((widget) => (
            <WidgetFrame key={widget.id} config={widget} canvasRect={canvasRect} />
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
              void startDevNativePreview().catch((error: unknown) => {
                setCameraError(error instanceof Error ? error.message : 'Native preview failed to start');
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

      <DeviceConnectionOverlay state={connectionState} onRetry={retryConnection} />

      <div className="mirror-session-pill">
        <span className="mirror-session-pill__label">Live Session</span>
        <strong>{profileLabel(activeProfile)}</strong>
        <span>{hardwareId}</span>
      </div>
    </>
  );
}

export default function MirrorApp() {
<<<<<<< HEAD
  const reducedMotion = useReducedMotion();
  const { hardwareId, mirror, profiles, activeProfile, mirrorSyncSnapshot, loading, error, refresh, activateUser, createProfile } =
=======
  const { hardwareId, mirror, profiles, activeProfile, mirrorSyncSnapshot, loading, error, refresh, activateUser } =
>>>>>>> 4991a018b6bf7e63948cee00e7ba8e063410e54b
    useMirrorSession();
  const [menuOpen, setMenuOpen] = useState(true);
  const [viewStack, setViewStack] = useState<OverlayView[]>(['identity']);
  const [identityIntent, setIdentityIntent] = useState<IdentityIntent>('activate');
  const [identitySubstate, setIdentitySubstate] = useState<IdentitySubstate>('list');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectionMemory, setSelectionMemory] = useState<Record<OverlayView, number>>({
    identity: 0,
    system: 0,
  });
  const [menuError, setMenuError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState<string | null>(null);
  const [showDevPanel, setShowDevPanel] = useState(readDevPanelInitial);
  const [fullScreenTryOnUrl, setFullScreenTryOnUrl] = useState<string | null>(null);
  const [animationMode, setAnimationMode] = useState<AnimationMode>(readAnimationInitial);
  const previousPendingAuthRef = useRef<ReturnType<typeof useAuthState>['pendingAuth']>(null);
  const { sleepMode, sleepModeRef, toggleDim, toggleSleep } = useMirrorDisplayMode();

  const currentView = viewStack[viewStack.length - 1] ?? 'identity';
  const activeProfileIndex = profiles.findIndex((profile) => profile.user_id === activeProfile?.user_id);
  const identityEntryCount = identitySubstate === 'list' ? profiles.length + 1 : Math.max(profiles.length, 1);
  const currentIdentityIndex = currentView === 'identity' ? selectedIndex : selectionMemory.identity;
  const clampedIdentityIndex = Math.max(0, Math.min(currentIdentityIndex, identityEntryCount - 1));
  const animationIndex = Math.max(0, ANIMATION_PRESETS.findIndex((preset) => preset.id === animationMode));
  const selectedProfile = profiles[clampedIdentityIndex] ?? null;
  const selectedCreateAccount = identitySubstate === 'list' && clampedIdentityIndex === profiles.length;

  const {
    providers: authProviders,
    pendingAuth,
    initiateLogin,
    cancelPendingAuth,
    disconnectProvider,
    refresh: refreshAuth,
  } = useAuthState({
    hardwareId,
    userId: selectedProfile?.user_id ?? activeProfile?.user_id ?? null,
    enabled: Boolean(hardwareId),
  });
  const { authError, signInGoogle, disconnectGoogle } = useAuthActions(initiateLogin, disconnectProvider);
  const googleConnected = authProviders.some((provider) => provider.provider === 'google' && provider.connected);

  const systemMenuItems = useMemo<SystemMenuItem[]>(
    () => [
      {
        id: 'profiles',
        label: 'Switch Profile',
        helper: 'Jump into identity selection and swap the live mirror profile.',
        status: activeProfile ? profileLabel(activeProfile) : 'Choose',
        icon: UserCircle2,
      },
      {
        id: 'google',
        label: googleConnected ? 'Google Linked' : 'Google Pairing',
        helper: googleConnected
          ? 'Disconnect the current profile or reopen pairing when needed.'
          : 'Pick a profile, scan a QR code, and finish pairing on your phone.',
        status: pendingAuth ? 'Pairing' : googleConnected ? 'Linked' : 'Ready',
        icon: Link2,
      },
      {
        id: 'guest',
        label: 'Create Account',
        helper: 'Start QR pairing and create a Google-linked account for this mirror.',
        status: 'QR',
        icon: UserPlus,
      },
      {
        id: 'animation',
        label: 'Visual Mode',
        helper: 'Cycle the ambient glass shell between the available motion moods.',
        status: ANIMATION_PRESETS[animationIndex]?.title ?? 'Aurora Flow',
        icon: Sparkles,
      },
      {
        id: 'refresh',
        label: 'Refresh Sync',
        helper: 'Reload mirror registration, profile state, and pairing status from the backend.',
        status: loading ? 'Syncing' : 'Ready',
        icon: RefreshCw,
      },
      {
        id: 'resume',
        label: 'Resume Mirror',
        helper: 'Dismiss the HUD and return to the live dashboard.',
        status: activeProfile ? 'Live' : 'Waiting',
        icon: CheckCircle2,
      },
    ],
    [activeProfile, animationIndex, googleConnected, loading, pendingAuth],
  );

  const currentSystemIndex = Math.max(0, Math.min(currentView === 'system' ? selectedIndex : selectionMemory.system, systemMenuItems.length - 1));
  const selectedSystemItem = systemMenuItems[currentSystemIndex] ?? systemMenuItems[0];
  const statusMessage = error || menuError || authError || (actionPending ? 'Updating mirror state...' : loading ? 'Preparing mirror registration and profile sync...' : null);

  useTimeOfDay();

  useEffect(() => {
    if (activeProfileIndex < 0) return;
    setSelectionMemory((previous) => (
      previous.identity === activeProfileIndex ? previous : { ...previous, identity: activeProfileIndex }
    ));
    if (currentView === 'identity' && identityIntent === 'activate' && identitySubstate === 'list') {
      setSelectedIndex(activeProfileIndex);
    }
  }, [activeProfileIndex, currentView, identityIntent, identitySubstate]);

  useEffect(() => {
    const clamped = Math.max(0, Math.min(selectionMemory.identity, identityEntryCount - 1));
    if (clamped !== selectionMemory.identity) {
      setSelectionMemory((previous) => ({ ...previous, identity: clamped }));
    }
    if (currentView === 'identity' && clamped !== selectedIndex) {
      setSelectedIndex(clamped);
    }
  }, [currentView, identityEntryCount, selectedIndex, selectionMemory.identity]);

  useEffect(() => {
    try {
      window.localStorage.setItem('smart-mirror.animation-mode', animationMode);
    } catch {
      /* ignore */
    }
  }, [animationMode]);

  useEffect(() => {
    try {
      window.localStorage.setItem(DEV_PANEL_STORAGE_KEY, String(showDevPanel));
    } catch {
      /* ignore */
    }
  }, [showDevPanel]);

  useEffect(() => {
    const hadPending = previousPendingAuthRef.current;

    if (pendingAuth) {
      const nextIdentityIndex = profiles.length > 0
        ? Math.max(0, Math.min(selectionMemory.identity, profiles.length - 1))
        : 0;
      setMenuOpen(true);
      setIdentityIntent('pair');
      setIdentitySubstate('pairing');
      setSelectionMemory((previous) => ({ ...previous, identity: nextIdentityIndex }));
      setSelectedIndex(nextIdentityIndex);
      setViewStack((previous) => (
        previous[previous.length - 1] === 'identity' ? previous : [...previous, 'identity']
      ));
    } else if (hadPending) {
      setIdentitySubstate('list');
      if (googleConnected) {
        const nextSystemIndex = Math.max(0, Math.min(selectionMemory.system, systemMenuItems.length - 1));
        setViewStack(['system']);
        setSelectedIndex(nextSystemIndex);
      }
    }

    previousPendingAuthRef.current = pendingAuth;
  }, [googleConnected, pendingAuth, profiles.length, selectionMemory.identity, selectionMemory.system, systemMenuItems.length]);

  useEffect(() => {
    if (authError && identityIntent === 'pair' && identitySubstate === 'pairing' && !pendingAuth) {
      setIdentitySubstate('list');
    }
  }, [authError, identityIntent, identitySubstate, pendingAuth]);

  const showSystemMenu = (replace = false) => {
    const nextSystemIndex = Math.max(0, Math.min(selectionMemory.system, systemMenuItems.length - 1));
    setSelectionMemory((previous) => ({ ...previous, system: nextSystemIndex }));
    setSelectedIndex(nextSystemIndex);
    setIdentitySubstate('list');
    setMenuError(null);
    setViewStack((previous) => {
      if (replace) return ['system'];
      return previous[previous.length - 1] === 'system' ? previous : [...previous, 'system'];
    });
  };

  const showIdentityMenu = (intent: IdentityIntent) => {
    const nextIdentityIndex = profiles.length > 0
      ? (activeProfileIndex >= 0 ? activeProfileIndex : Math.max(0, Math.min(selectionMemory.identity, profiles.length - 1)))
      : 0;
    setIdentityIntent(intent);
    setIdentitySubstate('list');
    setSelectionMemory((previous) => ({ ...previous, identity: nextIdentityIndex }));
    setSelectedIndex(nextIdentityIndex);
    setMenuError(null);
    setViewStack((previous) => (
      previous[previous.length - 1] === 'identity' ? previous : [...previous, 'identity']
    ));
  };

  const openMenuOverlay = () => {
    setMenuOpen(true);
    if (activeProfile) {
      showSystemMenu(true);
      return;
    }
    showIdentityMenu('activate');
  };

  const closeMenuOverlay = () => {
    setMenuError(null);
    setIdentitySubstate('list');
    setMenuOpen(false);
  };

  const moveSelection = (delta: number) => {
    if (currentView === 'identity' && identitySubstate === 'pairing') return;
    const length = currentView === 'identity' ? identityEntryCount : systemMenuItems.length;
    if (length <= 0) return;
    const next = nextIndex(selectedIndex, delta, length);
    setSelectedIndex(next);
    setSelectionMemory((previous) => ({ ...previous, [currentView]: next }));
    setMenuError(null);
  };

  const handleCreateAccount = async () => {
    try {
      setActionPending('create');
      setMenuError(null);
      setIdentityIntent('create');
      setIdentitySubstate('pairing');
      await signInGoogle({
        intent: 'create_account',
        targetUserId: createPendingAccountUserId(),
      });
    } finally {
      setActionPending(null);
    }
  };

  const handleActivateProfile = async (profile: MirrorProfile) => {
    try {
      setActionPending('profile');
      setMenuError(null);
      await activateUser(profile.user_id);
      showSystemMenu(true);
    } catch (err) {
      setMenuError(err instanceof Error ? err.message : 'Failed to activate that profile.');
    } finally {
      setActionPending(null);
    }
  };

  const handleRefreshSession = async () => {
    try {
      setActionPending('refresh');
      setMenuError(null);
      await refresh();
    } catch (err) {
      setMenuError(err instanceof Error ? err.message : 'Failed to refresh the mirror session.');
    } finally {
      setActionPending(null);
    }
  };

  const handlePairSelectedProfile = async (opts?: { createAccount?: boolean }) => {
    const createAccount = Boolean(opts?.createAccount);
    if (!selectedProfile && !createAccount) {
      setMenuError('Select a profile before pairing Google.');
      return;
    }
    setActionPending('pair');
    setMenuError(null);
    setIdentitySubstate('pairing');
    await signInGoogle(
      createAccount
        ? { intent: 'create_account', targetUserId: createPendingAccountUserId() }
        : { intent: 'pair_profile' },
    );
    setActionPending(null);
  };

  const cycleAnimation = () => {
    const nextAnimationIndex = nextIndex(animationIndex, 1, ANIMATION_PRESETS.length);
    const nextAnimation = ANIMATION_PRESETS[nextAnimationIndex];
    if (!nextAnimation) return;
    setAnimationMode(nextAnimation.id);
    setMenuError(null);
  };

  const handleSystemSelect = async (item: SystemMenuItem) => {
    switch (item.id) {
      case 'profiles':
        showIdentityMenu('activate');
        return;
      case 'google':
        if (googleConnected) {
          try {
            setActionPending('google');
            setMenuError(null);
            await disconnectGoogle();
          } catch (err) {
            setMenuError(err instanceof Error ? err.message : 'Failed to update Google pairing.');
          } finally {
            setActionPending(null);
          }
          return;
        }
        showIdentityMenu('pair');
        return;
      case 'guest':
        await handleCreateAccount();
        return;
      case 'animation':
        cycleAnimation();
        return;
      case 'refresh':
        await handleRefreshSession();
        return;
      case 'resume':
        closeMenuOverlay();
        return;
      default:
        return;
    }
  };

  const handleIdentitySelect = async () => {
    if (selectedCreateAccount || identityIntent === 'create') {
      await handlePairSelectedProfile({ createAccount: true });
      return;
    }
    if (profiles.length === 0) {
      if (identityIntent === 'pair') {
        setMenuError('Create a profile before pairing Google.');
        return;
      }
      setMenuError('Select Create Account to continue.');
      return;
    }
    if (!selectedProfile) {
      setMenuError('Select a profile to continue.');
      return;
    }
    if (identityIntent === 'pair') {
      await handlePairSelectedProfile();
      return;
    }
    await handleActivateProfile(selectedProfile);
  };

  const handleMenuSelect = async () => {
    if (loading || actionPending) return;
    if (currentView === 'identity') {
      if (identitySubstate === 'pairing') return;
      await handleIdentitySelect();
      return;
    }
    const item = selectedSystemItem;
    if (!item) return;
    await handleSystemSelect(item);
  };

  const handleMenuBack = () => {
    if (identitySubstate === 'pairing') {
      setMenuError(null);
      setIdentitySubstate('list');
      void cancelPendingAuth();
      return;
    }

    if (viewStack.length > 1) {
      const nextView = viewStack[viewStack.length - 2] ?? 'system';
      const nextLength = nextView === 'identity' ? identityEntryCount : systemMenuItems.length;
      const nextSelection = Math.max(0, Math.min(selectionMemory[nextView], nextLength - 1));
      setViewStack((previous) => previous.slice(0, -1));
      setSelectedIndex(nextSelection);
      setMenuError(null);
      return;
    }

    closeMenuOverlay();
  };

  const handleButtonInput = (input: MirrorButtonInput) => {
    const candidates = [
      ...(input.semanticActions ?? []),
      ...(input.semanticAction ? [input.semanticAction] : []),
      ...(input.effect ? [input.effect] : []),
    ];

    const pick = (choices: string[]) => choices.find((choice) => candidates.includes(choice));

    if (sleepModeRef.current) {
      const wakeAction = pick([
        'open',
        'select',
        'back',
        'profile_menu_open',
        'menu_open',
        'display_toggle_sleep',
        'toggle_sleep',
      ]);
      if (wakeAction) toggleSleep();
      return;
    }

    if (menuOpen) {
      const action = pick([
        'back',
        'menu_back',
        'menu_close',
        'up',
        'menu_up',
        'down',
        'menu_down',
        'select',
        'menu_select',
        'toggle_dev_panel',
        'display_toggle_sleep',
        'toggle_sleep',
      ]);

      switch (action) {
        case 'back':
        case 'menu_back':
        case 'menu_close':
          handleMenuBack();
          return;
        case 'up':
        case 'menu_up':
          moveSelection(-1);
          return;
        case 'down':
        case 'menu_down':
          moveSelection(1);
          return;
        case 'select':
        case 'menu_select':
          void handleMenuSelect();
          return;
        case 'toggle_dev_panel':
          setShowDevPanel((value) => !value);
          return;
        case 'display_toggle_sleep':
        case 'toggle_sleep':
          toggleSleep();
          return;
        default:
          return;
      }
    }

    const action = pick([
      'open',
      'profile_menu_open',
      'menu_open',
      'display_toggle_dim',
      'toggle_dim',
      'display_toggle_sleep',
      'toggle_sleep',
      'dismiss_tryon',
      'toggle_dev_panel',
    ]);

    switch (action) {
      case 'open':
      case 'profile_menu_open':
      case 'menu_open':
        openMenuOverlay();
        return;
      case 'display_toggle_dim':
      case 'toggle_dim':
        toggleDim();
        return;
      case 'display_toggle_sleep':
      case 'toggle_sleep':
        toggleSleep();
        return;
      case 'dismiss_tryon':
        setFullScreenTryOnUrl(null);
        return;
      case 'toggle_dev_panel':
        setShowDevPanel((value) => !value);
        return;
      default:
        return;
    }
  };

  useMirrorInput({
    onButtonInput: handleButtonInput,
    getSleepMode: () => sleepModeRef.current,
  });

  return (
    <MotionConfig reducedMotion={reducedMotion ? 'always' : 'never'}>
      <TooltipProvider delayDuration={400}>
        <div className={`mirror-shell mirror-shell--${animationMode} ${reducedMotion ? 'mirror-shell--performance' : ''}`}>
          <div className="mirror-ambient-layer" aria-hidden="true" />
          <div className="mirror-orbit-layer" aria-hidden="true" />

          {activeProfile && (
            <MirrorDashboard
              key={activeProfile.user_id}
              hardwareId={hardwareId}
              activeProfile={activeProfile}
              syncWidgets={mirrorSyncSnapshot?.widget_config ?? null}
              syncUserSettings={mirrorSyncSnapshot?.user_settings ?? null}
              showDevPanel={showDevPanel}
              toggleDim={toggleDim}
              toggleSleep={toggleSleep}
              fullScreenTryOnUrl={fullScreenTryOnUrl}
              setFullScreenTryOnUrl={setFullScreenTryOnUrl}
              authProviders={authProviders}
              pendingAuth={pendingAuth}
              authError={authError}
              signInGoogle={signInGoogle}
              disconnectGoogle={disconnectGoogle}
              refreshAuth={refreshAuth}
            />
          )}

          {!activeProfile && !loading && (
            <div className="mirror-empty-state">
              <Waves size={32} />
              <h2>No active profile yet</h2>
              <p>Create or activate a household profile from the mirror HUD to start the dashboard.</p>
            </div>
          )}

          <AnimatePresence>
            {menuOpen && (
              <motion.div
                className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/35 px-4 py-6 backdrop-blur-[8px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.22 }}
              >
                <motion.div
                  className="relative flex w-full max-w-[420px] flex-col overflow-hidden rounded-[40px] border border-white/10 bg-[rgba(255,255,255,0.03)] text-white shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] backdrop-blur-[24px]"
                  initial={{ opacity: 0, y: 20, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 14, scale: 0.98 }}
                  transition={SPRING_SOFT}
                >
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(230,213,184,0.12),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.01))]" />
                  <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-white/30" />

<<<<<<< HEAD
                  <div className="relative flex items-start justify-between gap-4 px-6 pt-6">
                    <div className="min-w-0">
                      <p className="text-[11px] uppercase tracking-[0.4em] text-white/55">
                        {currentView === 'identity' ? 'Identity Select' : 'System Menu'}
                      </p>
                      <h1
                        className="mt-3 text-[clamp(1.7rem,2.8vw,2.15rem)] leading-none"
                        style={{ fontFamily: 'var(--font-display)' }}
                      >
                        {currentView === 'identity'
                          ? identityIntent === 'pair'
                            ? 'Choose a profile to pair'
                            : 'Choose who is here'
                          : 'Mirror controls'}
                      </h1>
                      <p className="mt-3 max-w-[18rem] text-sm leading-5 text-white/60">
                        {currentView === 'identity'
                          ? identitySubstate === 'pairing'
                            ? 'Keep your phone ready while the selected profile waits for pairing.'
                            : activeProfile
                              ? `Current profile: ${profileLabel(activeProfile)}`
                              : 'Use the tactile controls or keyboard to enter the mirror.'
                          : selectedSystemItem?.helper ?? 'Navigate with tactile controls or the keyboard.'}
                      </p>
                    </div>
                    <div className="rounded-[20px] border border-white/10 bg-black/15 px-3 py-2 text-right text-[11px] leading-4 text-white/55">
                      <div className="font-medium text-white/80">{mirror?.friendly_name || 'Shared Smart Mirror'}</div>
                      <div>{hardwareId}</div>
                    </div>
                  </div>

                  <div className="relative flex-1 overflow-hidden px-4 pb-4 pt-5">
                    <AnimatePresence mode="wait">
                      {currentView === 'identity' ? (
                        <motion.div
                          key={`identity-${identityIntent}-${identitySubstate}`}
                          className="flex max-h-[68vh] flex-col gap-4"
                          initial={{ opacity: 0, x: -14 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 14 }}
                          transition={SPRING_SOFT}
                        >
                          {identitySubstate === 'pairing' ? (
                            <div className="space-y-4">
                              <div className="rounded-[24px] border border-white/10 bg-black/15 px-4 py-3 text-sm text-white/65">
                                <div className="text-[11px] uppercase tracking-[0.3em] text-white/45">Pairing Target</div>
                                <div className="mt-2 text-base text-white">
                                  {selectedProfile ? profileLabel(selectedProfile) : 'Selected profile'}
                                </div>
=======
                <div className="relative flex items-start justify-between gap-4 px-6 pt-6">
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-[0.4em] text-white/55">
                      {currentView === 'identity' ? 'Identity Select' : 'System Menu'}
                    </p>
                    <h1
                      className="mt-3 text-[clamp(1.7rem,2.8vw,2.15rem)] leading-none"
                      style={{ fontFamily: 'var(--font-display)' }}
                    >
                      {currentView === 'identity'
                        ? identitySubstate === 'pairing'
                          ? identityIntent === 'create'
                            ? 'Create a Google account'
                            : 'Choose a profile to pair'
                          : identityIntent === 'pair'
                            ? 'Choose a profile to pair'
                            : 'Choose who is here'
                        : 'Mirror controls'}
                    </h1>
                    <p className="mt-3 max-w-[18rem] text-sm leading-5 text-white/60">
                      {currentView === 'identity'
                        ? identitySubstate === 'pairing'
                          ? identityIntent === 'create'
                            ? 'Scan the QR code and sign in with Google to create your mirror account.'
                            : 'Keep your phone ready while the selected profile waits for pairing.'
                          : identityIntent === 'pair'
                            ? 'Select an existing profile or choose Create Account to start Google pairing.'
                            : activeProfile
                              ? `Current profile: ${profileLabel(activeProfile)}`
                              : 'Select an existing profile or choose Create Account.'
                        : selectedSystemItem?.helper ?? 'Navigate with tactile controls or the keyboard.'}
                    </p>
                  </div>
                  <div className="rounded-[20px] border border-white/10 bg-black/15 px-3 py-2 text-right text-[11px] leading-4 text-white/55">
                    <div className="font-medium text-white/80">{mirror?.friendly_name || 'Shared Smart Mirror'}</div>
                    <div>{hardwareId}</div>
                  </div>
                </div>

                <div className="relative flex-1 overflow-hidden px-4 pb-4 pt-5">
                  <AnimatePresence mode="wait">
                    {currentView === 'identity' ? (
                      <motion.div
                        key={`identity-${identityIntent}-${identitySubstate}`}
                        className="flex max-h-[68vh] flex-col gap-4"
                        initial={{ opacity: 0, x: -14 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 14 }}
                        transition={SPRING_SOFT}
                      >
                        {identitySubstate === 'pairing' ? (
                          <div className="space-y-4">
                            <div className="rounded-[24px] border border-white/10 bg-black/15 px-4 py-3 text-sm text-white/65">
                              <div className="text-[11px] uppercase tracking-[0.3em] text-white/45">Pairing Target</div>
                              <div className="mt-2 text-base text-white">
                                {identityIntent === 'create'
                                  ? 'New Google Account'
                                  : selectedProfile
                                    ? profileLabel(selectedProfile)
                                    : 'Selected profile'}
>>>>>>> 4991a018b6bf7e63948cee00e7ba8e063410e54b
                              </div>
                              <div className="rounded-[28px] border border-white/10 bg-white/[0.04] px-5 py-5">
                                <div className="mx-auto flex w-full max-w-[252px] items-center justify-center rounded-[24px] bg-white p-5">
                                  {pendingAuth ? (
                                    <QRCodeSVG
                                      value={pendingAuth.deviceCode.verification_uri}
                                      size={188}
                                      bgColor="#FFFFFF"
                                      fgColor="#111111"
                                      level="M"
                                    />
                                  ) : (
                                    <motion.div
                                      className="flex h-[188px] w-[188px] items-center justify-center rounded-[18px] bg-[#F5F1EA] text-[#2A2017]"
                                      animate={reducedMotion ? { opacity: 1 } : { opacity: [0.55, 1, 0.55] }}
                                      transition={reducedMotion ? { duration: 0 } : { duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                                    >
                                      Requesting QR
                                    </motion.div>
                                  )}
                                </div>
                                <motion.p
                                  className="mt-5 text-center text-sm uppercase tracking-[0.3em] text-[#E6D5B8]"
                                  animate={reducedMotion ? { opacity: 0.92 } : { opacity: [0.45, 0.92, 0.45] }}
                                  transition={reducedMotion ? { duration: 0 } : { duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
                                >
                                  Waiting for pairing
                                </motion.p>
                                {pendingAuth?.deviceCode.user_code && (
                                  <div className="mt-4 text-center text-lg font-semibold tracking-[0.28em] text-white">
                                    {pendingAuth.deviceCode.user_code}
                                  </div>
                                )}
                                {pendingAuth?.deviceCode.verification_uri && (
                                  <p className="mt-4 text-center text-xs leading-5 text-white/45">
                                    {pendingAuth.deviceCode.verification_uri}
                                  </p>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-3 overflow-y-auto pr-1">
                              {profiles.length === 0 ? (
                                <IdentityEmptyTile active={clampedIdentityIndex === 0} onClick={() => void handleIdentitySelect()} />
                              ) : (
                                profiles.map((profile, index) => (
                                  <IdentityTile
                                    key={profile.user_id}
                                    profile={profile}
                                    index={index}
                                    active={index === clampedIdentityIndex}
                                    live={profile.user_id === activeProfile?.user_id}
                                    googleConnected={index === clampedIdentityIndex && googleConnected}
                                    onClick={() => {
                                      setSelectedIndex(index);
                                      setSelectionMemory((previous) => ({ ...previous, identity: index }));
                                    }}
                                  />
                                ))
                              )}
                            </div>
<<<<<<< HEAD
                          )}
=======
                          </div>
                        ) : (
                          <div className="space-y-3 overflow-y-auto pr-1">
                            {profiles.map((profile, index) => (
                              <IdentityTile
                                key={profile.user_id}
                                profile={profile}
                                index={index}
                                active={index === clampedIdentityIndex}
                                live={profile.user_id === activeProfile?.user_id}
                                googleConnected={index === clampedIdentityIndex && googleConnected}
                                onClick={() => {
                                  setSelectedIndex(index);
                                  setSelectionMemory((previous) => ({ ...previous, identity: index }));
                                }}
                              />
                            ))}
                            <CreateAccountTile
                              active={clampedIdentityIndex === profiles.length}
                              onClick={() => {
                                const index = profiles.length;
                                setSelectedIndex(index);
                                setSelectionMemory((previous) => ({ ...previous, identity: index }));
                              }}
                            />
                          </div>
                        )}
>>>>>>> 4991a018b6bf7e63948cee00e7ba8e063410e54b

                          <div className="rounded-[24px] border border-white/10 bg-black/15 px-4 py-3 text-sm text-white/60">
                            <div className="text-[11px] uppercase tracking-[0.3em] text-white/45">
                              {identityIntent === 'pair' ? 'Pairing Mode' : 'Selection Mode'}
                            </div>
                            <p className="mt-2 leading-5">
                              {identityIntent === 'pair'
                                ? 'Select a profile, then scan the QR code on your phone. Escape or Backspace cancels pairing.'
                                : 'Use Up and Down to wrap through profiles. Enter confirms the highlighted identity.'}
                            </p>
                          </div>
<<<<<<< HEAD
                        </motion.div>
                      ) : (
                        <motion.div
                          key="system"
                          className="flex max-h-[68vh] flex-col gap-4"
                          initial={{ opacity: 0, x: 14 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -14 }}
                          transition={SPRING_SOFT}
                        >
                          <div className="rounded-[24px] border border-white/10 bg-black/15 px-4 py-3 text-sm text-white/60">
                            <div className="flex items-center justify-between gap-4">
                              <div>
                                <div className="text-[11px] uppercase tracking-[0.3em] text-white/45">Active Identity</div>
                                <div className="mt-2 text-base text-white">
                                  {activeProfile ? profileLabel(activeProfile) : 'No active profile'}
                                </div>
                              </div>
                              <div className="rounded-full border border-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-white/55">
                                {googleConnected ? 'Google Linked' : 'Google Ready'}
=======
                          <p className="mt-2 leading-5">
                            {identityIntent === 'pair'
                              ? 'Select a profile, then scan the QR code on your phone. Escape or Backspace cancels pairing.'
                              : selectedCreateAccount
                                ? 'Create Account opens a Google QR sign-in and will activate the new profile automatically.'
                              : 'Use Up and Down to wrap through profiles. Enter confirms the highlighted identity.'}
                          </p>
                        </div>
                      </motion.div>
                    ) : (
                      <motion.div
                        key="system"
                        className="flex max-h-[68vh] flex-col gap-4"
                        initial={{ opacity: 0, x: 14 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -14 }}
                        transition={SPRING_SOFT}
                      >
                        <div className="rounded-[24px] border border-white/10 bg-black/15 px-4 py-3 text-sm text-white/60">
                          <div className="flex items-center justify-between gap-4">
                            <div>
                              <div className="text-[11px] uppercase tracking-[0.3em] text-white/45">Active Identity</div>
                              <div className="mt-2 text-base text-white">
                                {activeProfile ? profileLabel(activeProfile) : 'No active profile'}
>>>>>>> 4991a018b6bf7e63948cee00e7ba8e063410e54b
                              </div>
                            </div>
                          </div>

                          <div className="space-y-3 overflow-y-auto pr-1">
                            {systemMenuItems.map((item, index) => (
                              <SystemMenuRow
                                key={item.id}
                                item={item}
                                active={index === currentSystemIndex}
                                onClick={() => {
                                  setSelectedIndex(index);
                                  setSelectionMemory((previous) => ({ ...previous, system: index }));
                                  void handleSystemSelect(item);
                                }}
                              />
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {statusMessage && (
                    <div className={`relative px-6 pb-4 text-sm ${error || menuError || authError ? 'text-rose-300' : 'text-white/55'}`}>
                      {statusMessage}
                    </div>
                  )}

                  <div className="relative border-t border-white/8 bg-black/15 px-6 py-4">
                    <FooterLegend />
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

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
                  Sleep mode - press any mapped key or hold the display button to wake
                </motion.span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </TooltipProvider>
    </MotionConfig>
  );
}
