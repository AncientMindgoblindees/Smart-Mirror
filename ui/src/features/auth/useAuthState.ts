import { useCallback, useEffect, useRef, useState } from 'react';
import {
  cancelLogin,
  getAuthProviders,
  getLoginStatus,
  logoutProvider,
  startLogin,
} from '@/api/mirrorApi';
import { useIntervalWhen } from '@/hooks/infra/useIntervalWhen';
import { useWindowEvent } from '@/hooks/infra/useWindowEvent';

export type ProviderStatus = {
  provider: string;
  connected: boolean;
  status: string;
  scopes?: string | null;
  connected_at?: string | null;
};

export type DeviceCodeInfo = {
  provider: string;
  verification_uri: string;
  user_code: string;
  expires_in: number;
  interval: number;
  message?: string | null;
};

export type PendingAuth = {
  provider: string;
  deviceCode: DeviceCodeInfo;
};

function clearIntervalRef(pollRef: { current: ReturnType<typeof setInterval> | null }) {
  if (pollRef.current) {
    clearInterval(pollRef.current);
    pollRef.current = null;
  }
}

type AuthContext = {
  hardwareId: string | null;
  userId: string | null;
  enabled?: boolean;
};

export function useAuthState({ hardwareId, userId, enabled = true }: AuthContext) {
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [pendingAuth, setPendingAuth] = useState<PendingAuth | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingProviderRef = useRef<string | null>(null);

  useEffect(() => {
    pendingProviderRef.current = pendingAuth?.provider ?? null;
  }, [pendingAuth]);

  const ready = enabled && Boolean(hardwareId) && Boolean(userId);

  const refresh = useCallback(async () => {
    if (!ready || !hardwareId || !userId) {
      setProviders([]);
      return;
    }
    try {
      const list = await getAuthProviders(hardwareId, userId);
      setProviders(list);
    } catch {
      // backend unavailable — keep stale state
    }
  }, [hardwareId, ready, userId]);

  useEffect(() => {
    if (!ready) {
      clearIntervalRef(pollRef);
      setPendingAuth(null);
      setProviders([]);
      return;
    }
    void refresh();
  }, [ready, refresh]);

  useIntervalWhen(() => void refresh(), 10_000, ready);

  const startPollForProvider = useCallback(
    (provider: string, intervalSec: number) => {
      if (!hardwareId || !userId) return;
      clearIntervalRef(pollRef);
      const ms = Math.max(3000, (intervalSec || 5) * 1000);
      pollRef.current = setInterval(async () => {
        try {
          const status = await getLoginStatus(provider, hardwareId, userId);
          if (status.status === 'active' || status.status === 'complete') {
            clearIntervalRef(pollRef);
            setPendingAuth(null);
            await refresh();
          } else if (status.status !== 'pending') {
            clearIntervalRef(pollRef);
            setPendingAuth(null);
            await refresh();
          }
        } catch {
          // ignore poll failures
        }
      }, ms);
    },
    [hardwareId, refresh, userId],
  );

  const applyDeviceCodePayload = useCallback(
    (detail: Record<string, unknown>) => {
      const provider = String(detail.provider ?? '');
      if (!provider) return;
      const deviceCode: DeviceCodeInfo = {
        provider,
        verification_uri: String(detail.verification_uri ?? ''),
        user_code: String(detail.user_code ?? ''),
        expires_in: Number(detail.expires_in) || 300,
        interval: Number(detail.interval) || 5,
        message: detail.message == null ? null : String(detail.message),
      };
      setPendingAuth({ provider, deviceCode });
      startPollForProvider(provider, deviceCode.interval);
    },
    [startPollForProvider],
  );

  useWindowEvent<Record<string, unknown>>('mirror:oauth_device_code', (detail) => {
    if (!ready) return;
    applyDeviceCodePayload(detail ?? {});
  });

  const initiateLogin = useCallback(
    async (provider: string) => {
      if (!hardwareId || !userId) {
        throw new Error('Select a mirror profile before linking Google.');
      }
      const deviceCode = await startLogin(provider, hardwareId, userId);
      setPendingAuth({
        provider,
        deviceCode: {
          provider,
          verification_uri: deviceCode.verification_uri,
          user_code: deviceCode.user_code,
          expires_in: deviceCode.expires_in,
          interval: deviceCode.interval,
          message: deviceCode.message ?? null,
        },
      });
      startPollForProvider(provider, deviceCode.interval || 5);
    },
    [hardwareId, startPollForProvider, userId],
  );

  const cancelPendingAuth = useCallback(async () => {
    const provider = pendingProviderRef.current;
    clearIntervalRef(pollRef);
    setPendingAuth(null);
    if (!provider || !hardwareId || !userId) return;
    try {
      await cancelLogin(provider, hardwareId, userId);
    } catch {
      // ignore cancellation failures
    }
  }, [hardwareId, userId]);

  const disconnectProvider = useCallback(
    async (provider: string) => {
      if (!hardwareId || !userId) return;
      await logoutProvider(provider, hardwareId, userId);
      await refresh();
    },
    [hardwareId, refresh, userId],
  );

  useEffect(() => {
    return () => {
      clearIntervalRef(pollRef);
    };
  }, []);

  return {
    providers,
    pendingAuth,
    initiateLogin,
    cancelPendingAuth,
    disconnectProvider,
    refresh,
  };
}
