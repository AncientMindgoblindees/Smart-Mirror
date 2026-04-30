import { useMemo } from 'react';
import type { ConnectionPhase, ConnectionState } from './useDeviceConnectionState';

export function useConnectionOverlayViewModel(phase: ConnectionPhase, state: ConnectionState) {
  const statusLabel = useMemo(() => {
    switch (phase) {
      case 'idle':
        return 'Awaiting Connection';
      case 'searching':
        return 'Scanning for device';
      case 'connecting':
        return 'Establishing link';
      case 'connected':
        return 'Connected';
      case 'disconnecting':
        return 'Disconnecting';
      case 'error':
        return 'Connection failed';
      default:
        return 'Waiting for device';
    }
  }, [phase]);

  const statusDetail = useMemo(() => {
    if (phase === 'idle') return 'Connect a companion device to continue';
    if (phase === 'connecting' && state.pendingDevice?.displayName) return state.pendingDevice.displayName;
    if (phase === 'connected' && state.activeDevice?.displayName) return state.activeDevice.displayName;
    if (phase === 'error' && state.errorMessage) return state.errorMessage;
    return null;
  }, [phase, state]);

  return { statusLabel, statusDetail };
}

export function overlayGlowColor(phase: ConnectionPhase): string {
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

export function overlayBloomFilter(phase: ConnectionPhase): string {
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
