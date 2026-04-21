import React from 'react';
import { AnimatePresence, motion, type Transition } from 'motion/react';
import {
  ChevronLeft,
  Link2,
  Play,
  Sparkles,
  UserCircle2,
  Waves,
  X,
  type LucideIcon,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

import type { MirrorProfile } from '@/api/backendTypes';
import type { PendingAuth } from '@/features/auth';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import './tactile-menu.css';

export type TactileMenuView = 'identity' | 'system' | 'menu';
export type TactileMenuDirection = 'previous' | 'next';
export type TactileMenuProfile = Pick<MirrorProfile, 'user_id' | 'display_name' | 'is_active'>;

export type TactileMenuOverlayProps = {
  profiles: readonly TactileMenuProfile[];
  activeProfile: TactileMenuProfile | null;
  hardwareId: string | null;
  mirrorName: string | null;
  currentAnimationLabel: string | null;
  googleConnected: boolean;
  pendingAuth: PendingAuth | null;
  menuOpen: boolean;
  currentView: TactileMenuView;
  selectedIndex: number;
  onNavigate: (direction: TactileMenuDirection) => void;
  onSelect: () => void;
  onBack: () => void;
  onOpenIdentity: () => void;
  onOpenMenu: () => void;
  onClose: () => void;
};

type RailItem = {
  id: string;
  label: string;
  meta: string;
  kicker?: string;
  badge?: string;
};

type SystemMenuItem = RailItem & {
  icon: LucideIcon;
  description: string;
};

const TRACK_SPRING: Transition = { type: 'spring', stiffness: 280, damping: 28, mass: 0.9 };
const ITEM_SPRING: Transition = { type: 'spring', stiffness: 360, damping: 30, mass: 0.8 };
const CONTENT_SPRING: Transition = { type: 'spring', stiffness: 220, damping: 26, mass: 0.95 };
const RAIL_ITEM_HEIGHT = 74;
const RAIL_VISIBLE_ROWS = 5;

function normalizeIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return ((index % length) + length) % length;
}

function profileLabel(profile: TactileMenuProfile): string {
  return profile.display_name?.trim() || profile.user_id;
}

function profileInitials(profile: TactileMenuProfile): string {
  const parts = profileLabel(profile)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) return 'SM';
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('');
}

function providerLabel(provider: string | null | undefined): string {
  if (!provider) return 'Phone Pairing';
  return provider
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ');
}

function buildSystemMenuItems(
  currentAnimationLabel: string | null,
  googleConnected: boolean,
  hardwareId: string | null,
): SystemMenuItem[] {
  return [
    {
      id: 'profiles',
      label: 'Profiles',
      meta: 'Switch mirror identity',
      kicker: 'Household',
      badge: 'View',
      icon: UserCircle2,
      description: 'Jump into profile selection to change who owns the current mirror session.',
    },
    {
      id: 'pairing',
      label: 'Phone Pairing',
      meta: googleConnected ? 'Google linked' : 'Link Google',
      kicker: 'Connection',
      badge: googleConnected ? 'Live' : 'Ready',
      icon: Link2,
      description: googleConnected
        ? 'Google access is already available for the current profile.'
        : 'Open device-code pairing and finish the account link from your phone.',
    },
    {
      id: 'animation',
      label: 'Ambient Motion',
      meta: currentAnimationLabel || 'Aurora Flow',
      kicker: 'Visuals',
      badge: 'Current',
      icon: Sparkles,
      description: 'Review the mirror ambiance label the parent has selected for the current scene.',
    },
    {
      id: 'resume',
      label: 'Resume Mirror',
      meta: hardwareId || 'Mirror session',
      kicker: 'Exit',
      badge: 'Close',
      icon: Play,
      description: 'Dismiss the HUD and return to the live mirror surface.',
    },
  ];
}

type RailProps = {
  items: readonly RailItem[];
  selectedIndex: number;
  reducedMotion: boolean;
};

function TactileRail({ items, selectedIndex, reducedMotion }: RailProps) {
  const safeIndex = normalizeIndex(selectedIndex, items.length);
  const activeOffset = (RAIL_VISIBLE_ROWS * RAIL_ITEM_HEIGHT - RAIL_ITEM_HEIGHT) / 2;

  if (items.length === 0) {
    return (
      <div className="tactile-menu__rail tactile-menu__rail--empty">
        <div className="tactile-menu__empty-rail">
          <strong>No items yet</strong>
          <span>The parent can open another view or provide more options.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="tactile-menu__rail" aria-hidden="true">
      <div className="tactile-menu__rail-focus" />
      <motion.div
        className="tactile-menu__rail-track"
        animate={{ y: activeOffset - safeIndex * RAIL_ITEM_HEIGHT }}
        transition={reducedMotion ? { duration: 0 } : TRACK_SPRING}
      >
        {items.map((item, index) => {
          const distance = Math.abs(index - safeIndex);
          const isActive = index === safeIndex;
          const opacity = distance >= 3 ? 0.14 : distance === 2 ? 0.34 : distance === 1 ? 0.6 : 1;
          const scale = isActive ? 1 : distance === 1 ? 0.96 : 0.92;

          return (
            <motion.div
              key={item.id}
              className={`tactile-menu__rail-item ${isActive ? 'is-active' : ''}`}
              animate={{ opacity, scale, x: isActive ? 0 : distance === 1 ? -8 : -16 }}
              transition={reducedMotion ? { duration: 0 } : ITEM_SPRING}
            >
              <div className="tactile-menu__rail-copy">
                <span className="tactile-menu__rail-label">{item.label}</span>
                <span className="tactile-menu__rail-meta">{item.meta}</span>
              </div>
              {item.badge && <span className="tactile-menu__rail-badge">{item.badge}</span>}
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}

type IdentityViewProps = {
  profiles: readonly TactileMenuProfile[];
  activeProfile: TactileMenuProfile | null;
  selectedIndex: number;
  googleConnected: boolean;
  reducedMotion: boolean;
};

function IdentityView({
  profiles,
  activeProfile,
  selectedIndex,
  googleConnected,
  reducedMotion,
}: IdentityViewProps) {
  const safeIndex = normalizeIndex(selectedIndex, profiles.length);
  const selectedProfile = profiles[safeIndex] ?? null;
  const railItems: RailItem[] = profiles.map((profile) => ({
    id: profile.user_id,
    label: profileLabel(profile),
    meta: profile.user_id,
    badge:
      activeProfile?.user_id === profile.user_id || profile.is_active
        ? 'Active'
        : undefined,
  }));

  return (
    <motion.div
      key="identity-view"
      className="tactile-menu__view"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={reducedMotion ? { duration: 0 } : CONTENT_SPRING}
    >
      <div className="tactile-menu__detail-card">
        {selectedProfile ? (
          <>
            <div className="tactile-menu__identity-head">
              <div className="tactile-menu__avatar">{profileInitials(selectedProfile)}</div>
              <div className="tactile-menu__detail-copy">
                <span className="tactile-menu__eyebrow">Identity Selection</span>
                <h2>{profileLabel(selectedProfile)}</h2>
                <p>{selectedProfile.user_id}</p>
              </div>
            </div>

            <div className="tactile-menu__pill-row">
              {(activeProfile?.user_id === selectedProfile.user_id || selectedProfile.is_active) && (
                <span className="tactile-menu__pill">Current Session</span>
              )}
              {googleConnected && <span className="tactile-menu__pill tactile-menu__pill--accent">Google Linked</span>}
              {!googleConnected && <span className="tactile-menu__pill tactile-menu__pill--muted">Phone Pair Ready</span>}
            </div>

            <p className="tactile-menu__detail-body">
              Rotate through household profiles, then press select to activate the highlighted identity.
            </p>
          </>
        ) : (
          <div className="tactile-menu__empty-state">
            <UserCircle2 size={22} />
            <div>
              <strong>No profiles available</strong>
              <span>Provide at least one profile to render identity selection.</span>
            </div>
          </div>
        )}
      </div>

      <TactileRail items={railItems} selectedIndex={safeIndex} reducedMotion={reducedMotion} />
    </motion.div>
  );
}

type SystemViewProps = {
  items: readonly SystemMenuItem[];
  selectedIndex: number;
  reducedMotion: boolean;
};

function SystemView({ items, selectedIndex, reducedMotion }: SystemViewProps) {
  const safeIndex = normalizeIndex(selectedIndex, items.length);
  const selectedItem = items[safeIndex] ?? items[0];
  const Icon = selectedItem?.icon ?? Waves;

  return (
    <motion.div
      key="system-view"
      className="tactile-menu__view"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={reducedMotion ? { duration: 0 } : CONTENT_SPRING}
    >
      <div className="tactile-menu__detail-card tactile-menu__detail-card--system">
        <div className="tactile-menu__system-icon">
          <Icon size={20} />
        </div>
        <div className="tactile-menu__detail-copy">
          <span className="tactile-menu__eyebrow">{selectedItem?.kicker || 'System Menu'}</span>
          <h2>{selectedItem?.label || 'System Menu'}</h2>
          <p>{selectedItem?.meta || 'Mirror controls'}</p>
        </div>
        <p className="tactile-menu__detail-body">
          {selectedItem?.description || 'Navigate the HUD, adjust context, or resume the mirror surface.'}
        </p>
      </div>

      <TactileRail items={items} selectedIndex={safeIndex} reducedMotion={reducedMotion} />
    </motion.div>
  );
}

type PairingViewProps = {
  pendingAuth: PendingAuth;
  reducedMotion: boolean;
};

function PairingView({ pendingAuth, reducedMotion }: PairingViewProps) {
  const hasUserCode = Boolean(pendingAuth.deviceCode.user_code?.trim());
  const title = `${providerLabel(pendingAuth.provider)} Pairing`;

  return (
    <motion.div
      key="pairing-view"
      className="tactile-menu__view"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={reducedMotion ? { duration: 0 } : CONTENT_SPRING}
    >
      <div className="tactile-menu__detail-card tactile-menu__detail-card--pairing">
        <div className="tactile-menu__pairing-header">
          <div className="tactile-menu__pairing-badge">
            <Link2 size={16} />
            <span>Pairing Active</span>
          </div>
          <div className="tactile-menu__detail-copy">
            <span className="tactile-menu__eyebrow">In-Card QR</span>
            <h2>{title}</h2>
            <p>Scan with your phone to finish the secure device-code flow.</p>
          </div>
        </div>

        <div className="tactile-menu__qr-shell">
          <QRCodeSVG
            value={pendingAuth.deviceCode.verification_uri}
            size={164}
            bgColor="transparent"
            fgColor="#f6fbff"
            level="M"
          />
        </div>

        {hasUserCode && <div className="tactile-menu__pairing-code">{pendingAuth.deviceCode.user_code}</div>}

        <div className="tactile-menu__pairing-meta">
          <span>{pendingAuth.deviceCode.verification_uri}</span>
          <span>Waiting for authorization...</span>
        </div>
      </div>
    </motion.div>
  );
}

type FooterLegendProps = {
  onNavigate: (direction: TactileMenuDirection) => void;
  onSelect: () => void;
};

function FooterLegend({ onNavigate, onSelect }: FooterLegendProps) {
  return (
    <div className="tactile-menu__footer">
      <button type="button" className="tactile-menu__legend-button" onClick={() => onNavigate('previous')}>
        <span className="tactile-menu__legend-dots" aria-hidden="true">
          <i />
          <i className="is-strong" />
        </span>
        <span>Previous</span>
      </button>

      <button type="button" className="tactile-menu__legend-button tactile-menu__legend-button--select" onClick={onSelect}>
        <span className="tactile-menu__legend-dots" aria-hidden="true">
          <i />
          <i className="is-strong" />
          <i />
        </span>
        <span>Select</span>
      </button>

      <button type="button" className="tactile-menu__legend-button" onClick={() => onNavigate('next')}>
        <span className="tactile-menu__legend-dots" aria-hidden="true">
          <i className="is-strong" />
          <i />
        </span>
        <span>Next</span>
      </button>
    </div>
  );
}

export function TactileMenuOverlay({
  profiles,
  activeProfile,
  hardwareId,
  mirrorName,
  currentAnimationLabel,
  googleConnected,
  pendingAuth,
  menuOpen,
  currentView,
  selectedIndex,
  onNavigate,
  onSelect,
  onBack,
  onOpenIdentity,
  onOpenMenu,
  onClose,
}: TactileMenuOverlayProps) {
  const reducedMotion = useReducedMotion();
  const systemItems = React.useMemo(
    () => buildSystemMenuItems(currentAnimationLabel, googleConnected, hardwareId),
    [currentAnimationLabel, googleConnected, hardwareId],
  );
  const resolvedView = currentView === 'menu' ? 'system' : currentView;
  const title =
    resolvedView === 'identity'
      ? 'Identity HUD'
      : pendingAuth
        ? 'Pairing HUD'
        : 'System HUD';
  const statusLabel = pendingAuth
    ? 'Pairing in progress'
    : resolvedView === 'identity'
      ? `${profiles.length} profile${profiles.length === 1 ? '' : 's'}`
      : 'Mirror controls';

  return (
    <AnimatePresence>
      {menuOpen && (
        <motion.div
          className="tactile-menu"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={reducedMotion ? { duration: 0 } : { duration: 0.22 }}
        >
          <motion.section
            className="tactile-menu__frame"
            role="dialog"
            aria-modal="true"
            aria-label="Tactile menu overlay"
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={reducedMotion ? { duration: 0 } : CONTENT_SPRING}
          >
            <div className="tactile-menu__glass" aria-hidden="true" />
            <div className="tactile-menu__header">
              <button type="button" className="tactile-menu__icon-button" onClick={onBack} aria-label="Go back">
                <ChevronLeft size={18} />
              </button>

              <div className="tactile-menu__brand">
                <div className="tactile-menu__brand-mark" aria-hidden="true">
                  <Waves size={18} />
                </div>
                <div className="tactile-menu__brand-copy">
                  <span>{title}</span>
                  <strong>{mirrorName?.trim() || 'Smart Mirror'}</strong>
                </div>
              </div>

              <button type="button" className="tactile-menu__icon-button" onClick={onClose} aria-label="Close menu">
                <X size={18} />
              </button>
            </div>

            <div className="tactile-menu__meta-row">
              <div className="tactile-menu__meta-chip">
                <span className="tactile-menu__meta-label">Hardware</span>
                <strong>{hardwareId?.trim() || 'Unregistered mirror'}</strong>
              </div>
              <div className="tactile-menu__meta-chip tactile-menu__meta-chip--status">
                <span className="tactile-menu__status-dot" aria-hidden="true" />
                <strong>{statusLabel}</strong>
              </div>
            </div>

            <div className="tactile-menu__switcher" role="tablist" aria-label="Overlay views">
              <button
                type="button"
                className={`tactile-menu__switch ${resolvedView === 'identity' ? 'is-active' : ''}`}
                role="tab"
                aria-selected={resolvedView === 'identity'}
                onClick={onOpenIdentity}
              >
                Identity
              </button>
              <button
                type="button"
                className={`tactile-menu__switch ${resolvedView === 'system' ? 'is-active' : ''}`}
                role="tab"
                aria-selected={resolvedView === 'system'}
                onClick={onOpenMenu}
              >
                System
              </button>
            </div>

            <div className="tactile-menu__content">
              <AnimatePresence mode="wait">
                {pendingAuth ? (
                  <PairingView pendingAuth={pendingAuth} reducedMotion={reducedMotion} />
                ) : resolvedView === 'identity' ? (
                  <IdentityView
                    profiles={profiles}
                    activeProfile={activeProfile}
                    selectedIndex={selectedIndex}
                    googleConnected={googleConnected}
                    reducedMotion={reducedMotion}
                  />
                ) : (
                  <SystemView
                    items={systemItems}
                    selectedIndex={selectedIndex}
                    reducedMotion={reducedMotion}
                  />
                )}
              </AnimatePresence>
            </div>

            <FooterLegend onNavigate={onNavigate} onSelect={onSelect} />
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default TactileMenuOverlay;
