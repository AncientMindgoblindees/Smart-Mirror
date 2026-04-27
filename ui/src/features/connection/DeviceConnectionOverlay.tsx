import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Smartphone, Wifi, WifiOff, AlertTriangle } from 'lucide-react';
import type { ConnectionState, ConnectionPhase } from './useDeviceConnectionState';
import './device-connection-overlay.css';

export type SoundCueCallback = (phase: ConnectionPhase) => void;

type Props = {
  state: ConnectionState;
  onRetry?: () => void;
  onSoundCue?: SoundCueCallback;
};

function phaseLabel(phase: ConnectionPhase, state: ConnectionState): string {
  if (phase === 'connected') return state.activeDevice?.displayName ?? 'Device connected';
  if (phase === 'connecting') return `Connecting ${state.pendingDevice?.displayName ?? 'device'}...`;
  if (phase === 'searching') return 'Searching for app...';
  if (phase === 'disconnecting') return 'Disconnecting...';
  if (phase === 'error') return 'Connection failed';
  return 'Awaiting app';
}

function toneClass(phase: ConnectionPhase): string {
  if (phase === 'connected') return 'connection-chip--connected';
  if (phase === 'error') return 'connection-chip--error';
  return 'connection-chip--active';
}

function chipIcon(phase: ConnectionPhase) {
  if (phase === 'connected') return <Smartphone size={13} />;
  if (phase === 'error') return <WifiOff size={13} />;
  return <Wifi size={13} />;
}

export function DeviceConnectionOverlay({ state, onRetry, onSoundCue }: Props) {
  const { phase } = state;
  React.useEffect(() => {
    onSoundCue?.(phase);
  }, [phase, onSoundCue]);

  return (
    <>
      <motion.div
        className={`connection-chip ${toneClass(phase)}`}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28 }}
      >
        <span className="connection-chip__icon" aria-hidden="true">{chipIcon(phase)}</span>
        <span className="connection-chip__text">{phaseLabel(phase, state)}</span>
      </motion.div>

      <AnimatePresence>
        {phase === 'error' && (
          <motion.div
            className="connection-error-toast"
            initial={{ opacity: 0, y: -16, x: 20 }}
            animate={{ opacity: 1, y: 0, x: 0 }}
            exit={{ opacity: 0, y: -10, x: 14 }}
            transition={{ duration: 0.2 }}
            role="alert"
          >
            <div className="connection-error-toast__row">
              <AlertTriangle size={15} />
              <span className="connection-error-toast__title">Companion app connection issue</span>
            </div>
            <div className="connection-error-toast__msg">
              {(state.errorMessage || 'The mirror could not connect to the app.').slice(0, 180)}
            </div>
            {onRetry ? (
              <button type="button" className="connection-error-toast__retry" onClick={onRetry}>
                Retry
              </button>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
