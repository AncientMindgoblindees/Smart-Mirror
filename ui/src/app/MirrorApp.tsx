import React, { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  CheckCircle2,
  ChevronRight,
  Link2,
  Sparkles,
  UserCircle2,
  UserPlus,
  Waves,
  X,
} from 'lucide-react';
import type { MirrorProfile } from '@/api/backendTypes';
import { TooltipProvider } from '@/components/ui/Tooltip';
import { AuthQROverlay, useAuthState } from '@/features/auth';
import { CameraOverlay } from '@/features/camera';
import { DeviceConnectionOverlay, useDeviceConnectionState } from '@/features/connection';
import { ToolsPanel } from '@/features/dev-panel';
import { DEV_PANEL_STORAGE_KEY, WidgetFrame, useWidgetPersistence } from '@/features/widgets';
import { useControlEvents } from '@/hooks/useControlEvents';
import { type MirrorButtonInput, useMirrorInput } from '@/hooks/useMirrorInput';
import { useParallax } from '@/hooks/useParallax';
import { useTimeOfDay } from '@/hooks/useTimeOfDay';
import { getApiBase } from '@/config/backendOrigin';
import { useAuthActions } from './hooks/useAuthActions';
import { useMirrorDisplayMode } from './hooks/useMirrorDisplayMode';
import { useMirrorSession } from './hooks/useMirrorSession';
import { useOverlayState } from './hooks/useOverlayState';
import './mirror-app.css';

type MenuSection = 'users' | 'create' | 'animations' | 'about';
type MenuMode = 'sections' | 'profiles' | 'create' | 'animations';
type AnimationMode = 'aurora' | 'pulse' | 'drift';

const MENU_SECTIONS: Array<{
  id: MenuSection;
  title: string;
  description: string;
  icon: typeof UserCircle2;
}> = [
  {
    id: 'users',
    title: 'Users',
    description: 'Choose who is visible on this mirror and link Google for that profile.',
    icon: UserCircle2,
  },
  {
    id: 'create',
    title: 'Create Profile',
    description: 'Enroll a new household profile into this mirror registry.',
    icon: UserPlus,
  },
  {
    id: 'animations',
    title: 'Animations',
    description: 'Pick the startup ambiance and menu motion style.',
    icon: Sparkles,
  },
  {
    id: 'about',
    title: 'Logo',
    description: 'Mirror identity, hardware status, and quick resume controls.',
    icon: Waves,
  },
];

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

type DashboardProps = {
  hardwareId: string;
  activeProfile: MirrorProfile;
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
  const { widgets, setWidgets } = useWidgetPersistence();
  const { showCamera, setShowCamera, cameraError, setCameraError } = useOverlayState();
  const captureFlowActiveRef = useRef(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasRect, setCanvasRect] = useState<DOMRect | null>(null);
  const { connectionState, handlers: deviceHandlers, retry: retryConnection } = useDeviceConnectionState();
  const parallax = useParallax();

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
    setWidgets((previous) => previous.map((widget) => (
      widget.id === id ? { ...widget, enabled: !widget.enabled } : widget
    )));
  };

  const visibleWidgets = useMemo(() => widgets.filter((widget) => widget.enabled), [widgets]);

  return (
    <>
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
  const [isPending, startTransition] = useTransition();
  const { hardwareId, mirror, profiles, activeProfile, loading, error, refresh, activateUser, createProfile } =
    useMirrorSession();
  const [menuOpen, setMenuOpen] = useState(true);
  const [menuMode, setMenuMode] = useState<MenuMode>('sections');
  const [sectionIndex, setSectionIndex] = useState(0);
  const [profileIndex, setProfileIndex] = useState(0);
  const [animationIndex, setAnimationIndex] = useState(0);
  const [draftProfileName, setDraftProfileName] = useState('');
  const [menuError, setMenuError] = useState<string | null>(null);
  const [showDevPanel, setShowDevPanel] = useState(readDevPanelInitial);
  const [fullScreenTryOnUrl, setFullScreenTryOnUrl] = useState<string | null>(null);
  const [animationMode, setAnimationMode] = useState<AnimationMode>(readAnimationInitial);
  const { sleepMode, sleepModeRef, toggleDim, toggleSleep } = useMirrorDisplayMode();

  const selectedSection = MENU_SECTIONS[sectionIndex] ?? MENU_SECTIONS[0];
  const selectedProfile = profiles[profileIndex] ?? activeProfile ?? null;
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
    enabled: Boolean(selectedProfile ?? activeProfile),
  });
  const { authError, signInGoogle, disconnectGoogle } = useAuthActions(initiateLogin, disconnectProvider);

  useTimeOfDay();

  useEffect(() => {
    const nextIndexValue = ANIMATION_PRESETS.findIndex((preset) => preset.id === animationMode);
    if (nextIndexValue >= 0) setAnimationIndex(nextIndexValue);
  }, [animationMode]);

  useEffect(() => {
    if (!activeProfile) return;
    const nextIndexValue = profiles.findIndex((profile) => profile.user_id === activeProfile.user_id);
    if (nextIndexValue >= 0) setProfileIndex(nextIndexValue);
  }, [activeProfile, profiles]);

  useEffect(() => {
    if (!menuOpen && activeProfile) {
      setMenuMode('sections');
      setMenuError(null);
      setDraftProfileName('');
      const nextIndexValue = profiles.findIndex((profile) => profile.user_id === activeProfile.user_id);
      if (nextIndexValue >= 0) setProfileIndex(nextIndexValue);
    }
  }, [activeProfile, menuOpen, profiles]);

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

  const selectAnimation = (index: number) => {
    const preset = ANIMATION_PRESETS[index];
    if (!preset) return;
    setAnimationIndex(index);
    setAnimationMode(preset.id);
    setMenuError(null);
  };

  const handleCreateProfile = async (name: string) => {
    try {
      setMenuError(null);
      const fallbackName = `Guest ${profiles.length + 1}`;
      await createProfile(name.trim() || fallbackName);
      setDraftProfileName('');
      setMenuOpen(false);
    } catch (err) {
      setMenuError(err instanceof Error ? err.message : 'Failed to create a profile.');
    }
  };

  const handleActivateProfile = async (profile: MirrorProfile) => {
    try {
      setMenuError(null);
      await activateUser(profile.user_id);
      setMenuOpen(false);
    } catch (err) {
      setMenuError(err instanceof Error ? err.message : 'Failed to activate that profile.');
    }
  };

  const handleMenuSelect = async () => {
    if (menuMode === 'sections') {
      if (selectedSection.id === 'users') {
        setMenuMode('profiles');
        return;
      }
      if (selectedSection.id === 'create') {
        setMenuMode('create');
        return;
      }
      if (selectedSection.id === 'animations') {
        setMenuMode('animations');
        return;
      }
      if (activeProfile) {
        setMenuOpen(false);
      }
      return;
    }

    if (menuMode === 'profiles') {
      if (selectedProfile) {
        await handleActivateProfile(selectedProfile);
      }
      return;
    }

    if (menuMode === 'animations') {
      selectAnimation(animationIndex);
      setMenuMode('sections');
      return;
    }

    if (menuMode === 'create') {
      await handleCreateProfile(draftProfileName);
    }
  };

  const handleMenuBack = () => {
    if (menuMode !== 'sections') {
      setMenuMode('sections');
      setMenuError(null);
      return;
    }
    if (activeProfile) {
      setMenuOpen(false);
    }
  };

  const handleButtonInput = (input: MirrorButtonInput) => {
    const candidates = [
      ...(input.semanticActions ?? []),
      ...(input.semanticAction ? [input.semanticAction] : []),
      ...(input.effect ? [input.effect] : []),
    ];

    const pick = (choices: string[]) => choices.find((choice) => candidates.includes(choice));

    if (sleepModeRef.current) {
      const wakeAction = pick(['display_toggle_sleep', 'toggle_sleep', 'profile_menu_open', 'menu_open']);
      if (wakeAction) {
        toggleSleep();
      }
      return;
    }

    if (menuOpen) {
      const action = pick([
        'profile_menu_open',
        'menu_open',
        'menu_back',
        'menu_close',
        'menu_up',
        'menu_down',
        'menu_select',
        'toggle_dev_panel',
        'display_toggle_sleep',
        'toggle_sleep',
      ]);
      switch (action) {
        case 'menu_back':
        case 'menu_close':
          handleMenuBack();
          return;
        case 'menu_up':
          startTransition(() => {
            if (menuMode === 'sections') {
              setSectionIndex((value) => nextIndex(value, -1, MENU_SECTIONS.length));
            } else if (menuMode === 'profiles') {
              setProfileIndex((value) => nextIndex(value, -1, profiles.length));
            } else if (menuMode === 'animations') {
              setAnimationIndex((value) => nextIndex(value, -1, ANIMATION_PRESETS.length));
            }
          });
          return;
        case 'menu_down':
          startTransition(() => {
            if (menuMode === 'sections') {
              setSectionIndex((value) => nextIndex(value, 1, MENU_SECTIONS.length));
            } else if (menuMode === 'profiles') {
              setProfileIndex((value) => nextIndex(value, 1, profiles.length));
            } else if (menuMode === 'animations') {
              setAnimationIndex((value) => nextIndex(value, 1, ANIMATION_PRESETS.length));
            }
          });
          return;
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
      case 'profile_menu_open':
      case 'menu_open':
        setMenuOpen(true);
        setMenuMode('sections');
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
    <TooltipProvider delayDuration={400}>
      <div className={`mirror-shell mirror-shell--${animationMode}`}>
        <div className="mirror-ambient-layer" aria-hidden="true" />
        <div className="mirror-orbit-layer" aria-hidden="true" />

        {activeProfile && (
          <MirrorDashboard
            key={activeProfile.user_id}
            hardwareId={hardwareId}
            activeProfile={activeProfile}
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
            <p>Create or activate a household profile from the mirror menu to start the dashboard.</p>
          </div>
        )}

        <AnimatePresence>
          {menuOpen && (
            <motion.div
              className="mirror-menu-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
            >
              <motion.div
                className="mirror-menu-shell"
                initial={{ opacity: 0, y: 18, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 14, scale: 0.98 }}
                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              >
                <div className="mirror-menu-hero">
                  <div className="mirror-brand-mark" aria-hidden="true">
                    <Waves size={28} />
                  </div>
                  <div className="mirror-brand-copy">
                    <p className="mirror-brand-kicker">Shared Gateway</p>
                    <h1>Smart Mirror</h1>
                    <p>
                      Boot menu active. Use the Pi buttons or keyboard:
                      <span> `M` opens menu, arrows move, Enter selects, Esc goes back.</span>
                    </p>
                  </div>
                  <div className="mirror-status-card">
                    <span className="mirror-status-card__label">Mirror</span>
                    <strong>{mirror?.friendly_name || 'Shared Smart Mirror'}</strong>
                    <span>{hardwareId}</span>
                    <span>{activeProfile ? `Current: ${profileLabel(activeProfile)}` : 'Waiting for profile'}</span>
                  </div>
                </div>

                <div className="mirror-menu-grid">
                  <div className="mirror-menu-sections">
                    {MENU_SECTIONS.map((section, index) => {
                      const Icon = section.icon;
                      const active = index === sectionIndex;
                      return (
                        <button
                          key={section.id}
                          type="button"
                          className={`mirror-menu-section ${active ? 'is-active' : ''}`}
                          onClick={() => {
                            setSectionIndex(index);
                            setMenuMode('sections');
                          }}
                        >
                          <div className="mirror-menu-section__icon">
                            <Icon size={18} />
                          </div>
                          <div className="mirror-menu-section__copy">
                            <strong>{section.title}</strong>
                            <span>{section.description}</span>
                          </div>
                          <ChevronRight size={16} />
                        </button>
                      );
                    })}
                  </div>

                  <div className="mirror-menu-panel">
                    {selectedSection.id === 'users' && (
                      <div className="mirror-menu-panel__content">
                        <div className="mirror-menu-panel__header">
                          <div>
                            <span className="mirror-menu-panel__eyebrow">Profiles</span>
                            <h2>Choose who is using the mirror</h2>
                          </div>
                          <button
                            type="button"
                            className="mirror-menu-chip"
                            onClick={() => setMenuMode(menuMode === 'profiles' ? 'sections' : 'profiles')}
                          >
                            {menuMode === 'profiles' ? 'Section Focus' : 'User Focus'}
                          </button>
                        </div>

                        <div className="mirror-profile-list">
                          {profiles.length === 0 && (
                            <div className="mirror-profile-card mirror-profile-card--empty">
                              <strong>No profiles enrolled</strong>
                              <span>Create a profile to claim the mirror.</span>
                            </div>
                          )}
                          {profiles.map((profile, index) => {
                            const googleConnected = authProviders.some(
                              (provider) => provider.provider === 'google' && provider.connected,
                            ) && selectedProfile?.user_id === profile.user_id;
                            const active = index === profileIndex;
                            return (
                              <button
                                key={profile.user_id}
                                type="button"
                                className={`mirror-profile-card ${active ? 'is-active' : ''}`}
                                onClick={() => {
                                  setProfileIndex(index);
                                  setMenuMode('profiles');
                                }}
                              >
                                <div className="mirror-profile-card__avatar">
                                  {profileLabel(profile).slice(0, 2).toUpperCase()}
                                </div>
                                <div className="mirror-profile-card__copy">
                                  <strong>{profileLabel(profile)}</strong>
                                  <span>{profile.user_id}</span>
                                </div>
                                <div className="mirror-profile-card__status">
                                  {profile.is_active && <span className="mirror-pill">Active</span>}
                                  {googleConnected && <span className="mirror-pill mirror-pill--good">Google</span>}
                                </div>
                              </button>
                            );
                          })}
                        </div>

                        <div className="mirror-menu-actions">
                          <button
                            type="button"
                            className="mirror-action-button"
                            disabled={!selectedProfile || isPending}
                            onClick={() => selectedProfile && void handleActivateProfile(selectedProfile)}
                          >
                            Use Selected Profile
                          </button>
                          <button
                            type="button"
                            className="mirror-action-button mirror-action-button--secondary"
                            disabled={!selectedProfile || Boolean(pendingAuth)}
                            onClick={() => void signInGoogle()}
                          >
                            <Link2 size={16} /> Link Google
                          </button>
                        </div>
                      </div>
                    )}

                    {selectedSection.id === 'create' && (
                      <div className="mirror-menu-panel__content">
                        <div className="mirror-menu-panel__header">
                          <div>
                            <span className="mirror-menu-panel__eyebrow">Enrollment</span>
                            <h2>Create a household profile</h2>
                          </div>
                        </div>
                        <p className="mirror-menu-copy">
                          Profile creation enrolls a user into this mirror registry. Google linking happens after the
                          profile exists, so the mirror never stores raw third-party credentials in the browser.
                        </p>
                        <label className="mirror-field">
                          <span>Display Name</span>
                          <input
                            value={draftProfileName}
                            onChange={(event) => setDraftProfileName(event.target.value)}
                            placeholder="Avery, Mom, Guest Room..."
                          />
                        </label>
                        <div className="mirror-menu-actions">
                          <button
                            type="button"
                            className="mirror-action-button"
                            onClick={() => void handleCreateProfile(draftProfileName)}
                          >
                            Create And Activate
                          </button>
                          <button
                            type="button"
                            className="mirror-action-button mirror-action-button--secondary"
                            onClick={() => {
                              setDraftProfileName('');
                              setMenuMode('sections');
                            }}
                          >
                            Back To Menu
                          </button>
                        </div>
                      </div>
                    )}

                    {selectedSection.id === 'animations' && (
                      <div className="mirror-menu-panel__content">
                        <div className="mirror-menu-panel__header">
                          <div>
                            <span className="mirror-menu-panel__eyebrow">Visual Mode</span>
                            <h2>Pick the mirror atmosphere</h2>
                          </div>
                          <button
                            type="button"
                            className="mirror-menu-chip"
                            onClick={() => setMenuMode(menuMode === 'animations' ? 'sections' : 'animations')}
                          >
                            {menuMode === 'animations' ? 'Section Focus' : 'Animation Focus'}
                          </button>
                        </div>
                        <div className="mirror-animation-list">
                          {ANIMATION_PRESETS.map((preset, index) => (
                            <button
                              key={preset.id}
                              type="button"
                              className={`mirror-animation-card ${animationIndex === index ? 'is-active' : ''}`}
                              onClick={() => {
                                setAnimationIndex(index);
                                selectAnimation(index);
                              }}
                            >
                              <div>
                                <strong>{preset.title}</strong>
                                <span>{preset.description}</span>
                              </div>
                              {animationMode === preset.id && <CheckCircle2 size={18} />}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedSection.id === 'about' && (
                      <div className="mirror-menu-panel__content">
                        <div className="mirror-menu-panel__header">
                          <div>
                            <span className="mirror-menu-panel__eyebrow">Identity</span>
                            <h2>Mirror logo and session overview</h2>
                          </div>
                        </div>
                        <div className="mirror-logo-card">
                          <div className="mirror-logo-card__mark">
                            <Waves size={32} />
                          </div>
                          <div>
                            <strong>{mirror?.friendly_name || 'Shared Smart Mirror'}</strong>
                            <span>Multi-user household mirror with cloud-scoped sessions.</span>
                          </div>
                        </div>
                        <div className="mirror-summary-list">
                          <div className="mirror-summary-row">
                            <span>Hardware ID</span>
                            <strong>{hardwareId}</strong>
                          </div>
                          <div className="mirror-summary-row">
                            <span>Profiles Enrolled</span>
                            <strong>{profiles.length}</strong>
                          </div>
                          <div className="mirror-summary-row">
                            <span>Animation</span>
                            <strong>{ANIMATION_PRESETS[animationIndex]?.title || 'Aurora Flow'}</strong>
                          </div>
                          <div className="mirror-summary-row">
                            <span>Session</span>
                            <strong>{activeProfile ? profileLabel(activeProfile) : 'No active user'}</strong>
                          </div>
                        </div>
                        <div className="mirror-menu-actions">
                          <button
                            type="button"
                            className="mirror-action-button"
                            disabled={!activeProfile}
                            onClick={() => setMenuOpen(false)}
                          >
                            Resume Mirror
                          </button>
                          <button
                            type="button"
                            className="mirror-action-button mirror-action-button--secondary"
                            onClick={() => void refresh()}
                          >
                            Refresh Session
                          </button>
                        </div>
                      </div>
                    )}

                    {(error || menuError || authError) && (
                      <p className="mirror-menu-error">{error || menuError || authError}</p>
                    )}

                    {loading && <p className="mirror-menu-copy">Preparing mirror registration and profile sync...</p>}
                    {isPending && <p className="mirror-menu-copy">Updating menu selection...</p>}
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

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
                Sleep mode - press any mapped key or hold the display button to wake
              </motion.span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </TooltipProvider>
  );
}
