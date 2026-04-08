import { useReducer, useCallback, useRef } from 'react';
import type { DeviceEventPayload } from '@/hooks/useControlEvents';

export type ConnectionPhase =
  | 'idle'
  | 'searching'
  | 'connecting'
  | 'connected'
  | 'disconnecting'
  | 'error';

export type DeviceInfo = {
  id: string;
  displayName: string | null;
};

export type ConnectionState = {
  phase: ConnectionPhase;
  activeDevice: DeviceInfo | null;
  pendingDevice: DeviceInfo | null;
  errorMessage: string | null;
  errorCode: string | null;
};

type Action =
  | { type: 'SEARCHING'; initiator?: string }
  | { type: 'CONNECTING'; device: DeviceInfo }
  | { type: 'CONNECTED'; device: DeviceInfo }
  | { type: 'DISCONNECTING'; deviceId: string; reason?: string | null }
  | { type: 'DISCONNECTED'; deviceId: string }
  | { type: 'ERROR'; message: string; code?: string | null; deviceId?: string | null }
  | { type: 'RETRY' }
  | { type: 'RESET' };

const INITIAL_STATE: ConnectionState = {
  phase: 'idle',
  activeDevice: null,
  pendingDevice: null,
  errorMessage: null,
  errorCode: null,
};

function reducer(state: ConnectionState, action: Action): ConnectionState {
  switch (action.type) {
    case 'SEARCHING':
      return {
        ...state,
        phase: 'searching',
        errorMessage: null,
        errorCode: null,
        pendingDevice: null,
      };

    case 'CONNECTING':
      return {
        ...state,
        phase: 'connecting',
        pendingDevice: action.device,
        errorMessage: null,
        errorCode: null,
      };

    case 'CONNECTED':
      return {
        phase: 'connected',
        activeDevice: action.device,
        pendingDevice: null,
        errorMessage: null,
        errorCode: null,
      };

    case 'DISCONNECTING':
      return {
        ...state,
        phase: 'disconnecting',
      };

    case 'DISCONNECTED':
      if (state.activeDevice?.id === action.deviceId) {
        return {
          ...state,
          phase: 'idle',
          activeDevice: null,
        };
      }
      return state;

    case 'ERROR':
      return {
        ...state,
        phase: 'error',
        errorMessage: action.message,
        errorCode: action.code ?? null,
        pendingDevice: null,
      };

    case 'RETRY':
      return {
        ...state,
        phase: 'searching',
        errorMessage: null,
        errorCode: null,
      };

    case 'RESET':
      return INITIAL_STATE;

    default:
      return state;
  }
}

export function useDeviceConnectionState() {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const stateRef = useRef(state);
  stateRef.current = state;

  const onDeviceSearching = useCallback((_p: DeviceEventPayload) => {
    dispatch({ type: 'SEARCHING', initiator: _p.initiator });
  }, []);

  const onDeviceConnecting = useCallback((p: DeviceEventPayload) => {
    dispatch({
      type: 'CONNECTING',
      device: { id: p.deviceId ?? 'unknown', displayName: p.displayName },
    });
  }, []);

  const onDeviceConnected = useCallback((p: DeviceEventPayload) => {
    dispatch({
      type: 'CONNECTED',
      device: { id: p.deviceId ?? 'unknown', displayName: p.displayName },
    });
  }, []);

  const onDeviceDisconnecting = useCallback((p: DeviceEventPayload) => {
    dispatch({
      type: 'DISCONNECTING',
      deviceId: p.deviceId ?? '',
      reason: p.reason,
    });
  }, []);

  const onDeviceDisconnected = useCallback((p: DeviceEventPayload) => {
    dispatch({ type: 'DISCONNECTED', deviceId: p.deviceId ?? '' });
  }, []);

  const onDeviceError = useCallback((p: DeviceEventPayload) => {
    dispatch({
      type: 'ERROR',
      message: p.message ?? 'Connection failed',
      code: p.code,
      deviceId: p.deviceId,
    });
  }, []);

  const retry = useCallback(() => {
    dispatch({ type: 'RETRY' });
  }, []);

  const reset = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, []);

  return {
    connectionState: state,
    handlers: {
      onDeviceSearching,
      onDeviceConnecting,
      onDeviceConnected,
      onDeviceDisconnecting,
      onDeviceDisconnected,
      onDeviceError,
    },
    retry,
    reset,
  };
}
