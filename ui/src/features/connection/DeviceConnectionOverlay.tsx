import React, { useMemo } from 'react';
import { AnimatePresence, motion, type Transition } from 'motion/react';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useParallax } from '@/hooks/useParallax';
import type { ConnectionState, ConnectionPhase } from './useDeviceConnectionState';
import './device-connection-overlay.css';

/* ── sound hook stub (optional integration point) ─── */
export type SoundCueCallback = (phase: ConnectionPhase) => void;

/* ── shared motion helpers ──────────────────────────── */

const SPRING_SOFT: Transition = { type: 'spring', stiffness: 120, damping: 18, mass: 1 };
const SPRING_SNAPPY: Transition = { type: 'spring', stiffness: 300, damping: 24, mass: 0.8 };

const PARTICLES = Array.from({ length: 18 }, (_, i) => ({
  id: i,
  x: `${Math.random() * 100}%`,
  y: `${Math.random() * 100}%`,
  delay: Math.random() * 4,
  duration: 3 + Math.random() * 3,
  size: 1 + Math.random() * 2,
}));

const IDLE_PARTICLES = Array.from({ length: 10 }, (_, i) => ({
  id: i,
  x: `${20 + Math.random() * 60}%`,
  y: `${20 + Math.random() * 60}%`,
  delay: Math.random() * 6,
  duration: 5 + Math.random() * 4,
  size: 1 + Math.random() * 1.5,
}));

const SCAN_RINGS = [0, 1, 2, 3];

/* ── sub-components ─────────────────────────────────── */

function ParticleField({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div className="particle-field">
      {PARTICLES.map((p) => (
        <motion.div
          key={p.id}
          className="particle"
          style={{ left: p.x, top: p.y, width: p.size, height: p.size }}
          animate={{
            opacity: [0, 0.6, 0],
            y: [0, -40 - Math.random() * 30],
            x: [0, (Math.random() - 0.5) * 20],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
}

function IdleParticleField() {
  return (
    <div className="particle-field">
      {IDLE_PARTICLES.map((p) => (
        <motion.div
          key={p.id}
          className="particle"
          style={{ left: p.x, top: p.y, width: p.size, height: p.size }}
          animate={{
            opacity: [0, 0.3, 0],
            y: [0, -20 - Math.random() * 15],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
}

function IdleBreathingRing() {
  return (
    <motion.div
      className="scan-ring"
      style={{ inset: '0' }}
      animate={{
        scale: [0.85, 1.15, 0.85],
        opacity: [0.15, 0.3, 0.15],
      }}
      transition={{
        duration: 4,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
    />
  );
}

function ScanRings({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <>
      {SCAN_RINGS.map((i) => (
        <motion.div
          key={i}
          className="scan-ring"
          style={{ inset: '0' }}
          animate={{
            scale: [0.3, 2.2],
            opacity: [0.5, 0],
          }}
          transition={{
            duration: 3,
            delay: i * 0.75,
            repeat: Infinity,
            ease: [0.16, 1, 0.3, 1],
          }}
        />
      ))}
    </>
  );
}

function SuccessCheck() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
      <motion.circle
        cx="24"
        cy="24"
        r="20"
        stroke="var(--color-success)"
        strokeWidth="2"
        fill="none"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      />
      <motion.path
        d="M14 24 L21 31 L34 18"
        stroke="var(--color-success)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
      />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
      <motion.circle
        cx="20"
        cy="20"
        r="16"
        stroke="var(--color-warm)"
        strokeWidth="2"
        fill="none"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={SPRING_SNAPPY}
      />
      <motion.path
        d="M20 12V22"
        stroke="var(--color-warm)"
        strokeWidth="2.5"
        strokeLinecap="round"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
      />
      <motion.circle
        cx="20"
        cy="28"
        r="1.5"
        fill="var(--color-warm)"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ ...SPRING_SNAPPY, delay: 0.35 }}
      />
    </svg>
  );
}

function DataStream({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <motion.div
      className="data-stream"
      style={{ left: '50%', top: '-10%', marginLeft: -1 }}
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: [0, 0.8, 0.4], height: '120%' }}
      transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
    >
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          style={{
            position: 'absolute',
            width: 4,
            height: 12,
            left: -1,
            borderRadius: 2,
            background: 'var(--color-accent-bright)',
          }}
          animate={{ top: ['-5%', '105%'] }}
          transition={{
            duration: 0.8,
            delay: i * 0.25,
            repeat: Infinity,
            ease: 'linear',
          }}
        />
      ))}
    </motion.div>
  );
}

/* ── glow colour per phase ──────────────────────────── */

function glowColor(phase: ConnectionPhase): string {
  switch (phase) {
    case 'searching':
      return 'rgba(94, 225, 217, 0.12)';
    case 'connecting':
      return 'rgba(94, 225, 217, 0.22)';
    case 'connected':
      return 'rgba(52, 211, 153, 0.25)';
    case 'error':
      return 'rgba(245, 166, 35, 0.18)';
    default:
      return 'rgba(94, 225, 217, 0.06)';
  }
}

function bloomFilter(phase: ConnectionPhase): string {
  switch (phase) {
    case 'connecting':
      return 'blur(1px) brightness(1.05)';
    case 'connected':
      return 'blur(0px) brightness(1.15)';
    case 'error':
      return 'blur(0px) brightness(1)';
    default:
      return 'blur(0px) brightness(1)';
  }
}

/* ── main overlay ───────────────────────────────────── */

type Props = {
  state: ConnectionState;
  onRetry?: () => void;
  onSoundCue?: SoundCueCallback;
};

export function DeviceConnectionOverlay({ state, onRetry, onSoundCue }: Props) {
  const reduced = useReducedMotion();
  const parallax = useParallax();
  const { phase } = state;

  const isIdle = phase === 'idle';
  const isSearching = phase === 'searching';
  const isConnecting = phase === 'connecting';
  const isConnected = phase === 'connected';
  const isError = phase === 'error';
  const isDisconnecting = phase === 'disconnecting';
  const showOverlay = phase !== 'connected';

  React.useEffect(() => {
    onSoundCue?.(phase);
  }, [phase, onSoundCue]);

  const statusLabel = useMemo(() => {
    switch (phase) {
      case 'idle': return 'Awaiting Connection';
      case 'searching': return 'Scanning for device';
      case 'connecting': return 'Establishing link';
      case 'connected': return 'Connected';
      case 'disconnecting': return 'Disconnecting';
      case 'error': return 'Connection failed';
      default: return 'Waiting for device';
    }
  }, [phase]);

  const statusDetail = useMemo(() => {
    if (isIdle) {
      return 'Connect a companion device to continue';
    }
    if (isConnecting && state.pendingDevice?.displayName) {
      return state.pendingDevice.displayName;
    }
    if (isConnected && state.activeDevice?.displayName) {
      return state.activeDevice.displayName;
    }
    if (isError && state.errorMessage) {
      return state.errorMessage;
    }
    return null;
  }, [phase, state, isIdle, isConnecting, isConnected, isError]);

  const focusRingBorder = isError
    ? 'rgba(245, 166, 35, 0.35)'
    : isConnected
      ? 'rgba(52, 211, 153, 0.5)'
      : 'rgba(94, 225, 217, 0.25)';

  const pxFar = reduced ? 0 : parallax.x * 0.08;
  const pyFar = reduced ? 0 : parallax.y * 0.08;
  const pxMid = reduced ? 0 : parallax.x * 0.18;
  const pyMid = reduced ? 0 : parallax.y * 0.18;
  const pxNear = reduced ? 0 : parallax.x * 0.32;
  const pyNear = reduced ? 0 : parallax.y * 0.32;

  return (
    <AnimatePresence>
      {showOverlay && (
        <motion.div
          className="connection-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          style={
            { '--conn-glow-color': glowColor(phase) } as React.CSSProperties
          }
        >
          {/* Far parallax layer: ambient glow + particles */}
          <motion.div
            className="connection-layer-far"
            animate={{
              x: pxFar,
              y: pyFar,
              filter: bloomFilter(phase),
            }}
            transition={SPRING_SOFT}
          >
            <motion.div
              className="connection-ambient"
              animate={{
                opacity: isIdle ? 0.25 : isConnected ? 0.7 : isError ? 0.5 : 0.4,
                scale: isConnecting ? 1.15 : isIdle ? 1.02 : 1,
              }}
              transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
            />
            {isIdle && <IdleParticleField />}
            <ParticleField active={isSearching || isConnecting} />
          </motion.div>

          {/* Mid parallax layer: scan rings */}
          <motion.div
            className="connection-layer-mid"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            animate={{ x: pxMid, y: pyMid }}
            transition={SPRING_SOFT}
          >
            <div
              style={{
                position: 'relative',
                width: 'clamp(200px, 50vmin, 400px)',
                height: 'clamp(200px, 50vmin, 400px)',
              }}
            >
              {isIdle && <IdleBreathingRing />}
              <ScanRings active={isSearching} />
              <DataStream active={isConnecting} />
            </div>
          </motion.div>

          {/* Near parallax layer: focus element + text */}
          <motion.div
            className="connection-layer-near"
            animate={{ x: pxNear, y: pyNear }}
            transition={SPRING_SOFT}
          >
            <motion.div
              className={`connection-focus ${isError ? 'shake' : ''}`}
              key={isError ? 'error-shake' : 'focus'}
              animate={{
                scale: isConnected ? 1.08 : isConnecting ? 1.04 : 1,
              }}
              transition={SPRING_SNAPPY}
            >
              {/* Outer glow ring */}
              <motion.div
                className="connection-focus-glow"
                animate={{
                  opacity: isConnected ? 0.9 : isConnecting ? 0.6 : 0.3,
                  scale: isConnected ? 1.3 : 1,
                }}
                transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
              />

              {/* Spinning border ring */}
              <motion.div
                className="connection-focus-ring"
                style={{ borderColor: focusRingBorder }}
                animate={{
                  rotate: isSearching ? 360 : 0,
                  scale: isConnected ? 1.1 : 1,
                  borderColor: focusRingBorder,
                }}
                transition={
                  isSearching
                    ? { rotate: { duration: 4, repeat: Infinity, ease: 'linear' }, scale: SPRING_SOFT, borderColor: { duration: 0.6 } }
                    : { ...SPRING_SOFT, borderColor: { duration: 0.6 } }
                }
              />

              {/* Second ring offset for depth */}
              <motion.div
                className="connection-focus-ring"
                style={{
                  inset: '-8%',
                  borderColor: focusRingBorder,
                  borderWidth: 1,
                  opacity: 0.4,
                }}
                animate={{
                  rotate: isSearching ? -360 : 0,
                  scale: isConnected ? 1.15 : 1,
                }}
                transition={
                  isSearching
                    ? { rotate: { duration: 6, repeat: Infinity, ease: 'linear' }, scale: SPRING_SOFT }
                    : SPRING_SOFT
                }
              />

              {/* Inner icon area */}
              <motion.div
                className="connection-focus-inner"
                animate={{
                  scale: isConnecting ? [1, 1.05, 1] : 1,
                  background: isError
                    ? 'rgba(245, 166, 35, 0.1)'
                    : isConnected
                      ? 'rgba(52, 211, 153, 0.12)'
                      : 'rgba(94, 225, 217, 0.08)',
                  borderColor: isError
                    ? 'rgba(245, 166, 35, 0.25)'
                    : isConnected
                      ? 'rgba(52, 211, 153, 0.3)'
                      : 'rgba(94, 225, 217, 0.15)',
                }}
                transition={
                  isConnecting
                    ? { scale: { duration: 1.5, repeat: Infinity, ease: 'easeInOut' }, background: { duration: 0.6 }, borderColor: { duration: 0.6 } }
                    : { ...SPRING_SNAPPY, background: { duration: 0.6 }, borderColor: { duration: 0.6 } }
                }
              >
                <AnimatePresence mode="wait">
                  {isIdle && (
                    <motion.div
                      key="idle-dot"
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        background: 'var(--color-accent-dim)',
                      }}
                      animate={{
                        scale: [1, 1.2, 1],
                        opacity: [0.4, 0.65, 0.4],
                      }}
                      transition={{
                        duration: 3,
                        repeat: Infinity,
                        ease: 'easeInOut',
                      }}
                    />
                  )}
                  {isConnected && (
                    <motion.div
                      key="check"
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.5, opacity: 0 }}
                      transition={SPRING_SNAPPY}
                    >
                      <SuccessCheck />
                    </motion.div>
                  )}
                  {isError && (
                    <motion.div
                      key="error-icon"
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.5, opacity: 0 }}
                      transition={SPRING_SNAPPY}
                    >
                      <ErrorIcon />
                    </motion.div>
                  )}
                  {(isSearching || isConnecting || isDisconnecting) && (
                    <motion.div
                      key="pulse-dot"
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        background: 'var(--color-accent)',
                      }}
                      animate={{
                        scale: [1, 1.4, 1],
                        opacity: [0.7, 1, 0.7],
                      }}
                      transition={{
                        duration: 1.5,
                        repeat: Infinity,
                        ease: 'easeInOut',
                      }}
                    />
                  )}
                </AnimatePresence>
              </motion.div>
            </motion.div>

            {/* Connected device node (appears during connecting/connected) */}
            <AnimatePresence>
              {(isConnecting || isConnected) && (
                <motion.div
                  className="device-node"
                  initial={{ opacity: 0, y: 30, scale: 0.6 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 15, scale: 0.8 }}
                  transition={SPRING_SOFT}
                  style={{ marginTop: 'var(--space-lg)' }}
                >
                  <motion.div
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: isConnected
                        ? 'var(--color-success)'
                        : 'var(--color-accent)',
                    }}
                    animate={
                      isConnecting
                        ? { scale: [1, 1.3, 1], opacity: [0.6, 1, 0.6] }
                        : { scale: 1, opacity: 1 }
                    }
                    transition={
                      isConnecting
                        ? { duration: 1, repeat: Infinity, ease: 'easeInOut' }
                        : SPRING_SNAPPY
                    }
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Status text */}
            <AnimatePresence mode="wait">
              <motion.div
                key={phase}
                className="connection-status"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={SPRING_SOFT}
              >
                <div className="connection-status-label">{statusLabel}</div>
                {statusDetail && (
                  <motion.div
                    className="connection-status-detail"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.15, duration: 0.5 }}
                  >
                    {statusDetail}
                  </motion.div>
                )}
              </motion.div>
            </AnimatePresence>

            {/* Retry button (error state) */}
            <AnimatePresence>
              {isError && onRetry && (
                <motion.button
                  className="retry-button"
                  type="button"
                  onClick={onRetry}
                  initial={{ opacity: 0, y: 16, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.95 }}
                  transition={SPRING_SOFT}
                  whileHover={{
                    scale: 1.06,
                    boxShadow: '0 0 20px rgba(245, 166, 35, 0.25)',
                  }}
                  whileTap={{ scale: 0.96 }}
                >
                  Retry Connection
                </motion.button>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Connected → fade-out burst */}
          <AnimatePresence>
            {isConnected && (
              <motion.div
                style={{
                  position: 'absolute',
                  inset: 0,
                  zIndex: 10,
                  background: 'radial-gradient(circle, rgba(52,211,153,0.12) 0%, transparent 60%)',
                  pointerEvents: 'none',
                }}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: [0, 0.7, 0], scale: [0.8, 1.6] }}
                transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
              />
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
