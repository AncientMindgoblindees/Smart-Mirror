import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getAuthProviders,
  getLoginStatus,
  startLogin,
  logoutProvider,
  cancelLogin,
} from '@/api/mirrorApi';

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

export function useAuthState() {
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [pendingAuth, setPendingAuth] = useState<PendingAuth | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingProviderRef = useRef<string | null>(null);

  useEffect(() => {
    pendingProviderRef.current = pendingAuth?.provider ?? null;
  }, [pendingAuth]);

  const refresh = useCallback(async () => {
    try {
      const list = await getAuthProviders();
      setProviders(list);
    } catch {
      // backend unavailable — keep stale state
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 10_000);
    return () => clearInterval(id);
  }, [refresh]);

  const startPollForProvider = useCallback(
    (provider: string, intervalSec: number) => {
      clearIntervalRef(pollRef);
      const ms = Math.max(3000, (intervalSec || 5) * 1000);
      pollRef.current = setInterval(async () => {
        try {
          const status = await getLoginStatus(provider);
          if (status.status === 'complete') {
            clearIntervalRef(pollRef);
            setPendingAuth(null);
            await refresh();
          } else if (status.status === 'pending') {
            // still waiting
          } else {
            clearIntervalRef(pollRef);
            setPendingAuth(null);
            await refresh();
          }
        } catch {
          // ignore poll failures
        }
      }, ms);
    },
    [refresh],
  );

  const applyDeviceCodePayload = useCallback(
    (d: Record<string, unknown>) => {
      const provider = String(d.provider ?? '');
      if (!provider) return;
      const deviceCode: DeviceCodeInfo = {
        provider,
        verification_uri: String(d.verification_uri ?? ''),
        user_code: String(d.user_code ?? ''),
        expires_in: Number(d.expires_in) || 300,
        interval: Number(d.interval) || 5,
        message: d.message == null ? null : String(d.message),
      };
      setPendingAuth({ provider, deviceCode });
      startPollForProvider(provider, deviceCode.interval);
    },
    [startPollForProvider],
  );

  useEffect(() => {
    const onDeviceCode = (e: Event) => {
      const ce = e as CustomEvent<Record<string, unknown>>;
      applyDeviceCodePayload(ce.detail ?? {});
    };
    window.addEventListener('mirror:oauth_device_code', onDeviceCode);
    return () => window.removeEventListener('mirror:oauth_device_code', onDeviceCode);
  }, [applyDeviceCodePayload]);

  const initiateLogin = useCallback(
    async (provider: string) => {
      const dc = await startLogin(provider);
      setPendingAuth({
        provider,
        deviceCode: {
          provider,
          verification_uri: dc.verification_uri,
          user_code: dc.user_code,
          expires_in: dc.expires_in,
          interval: dc.interval,
          message: dc.message ?? null,
        },
      });
      startPollForProvider(provider, dc.interval || 5);
    },
    [startPollForProvider],
  );

  const cancelPendingAuth = useCallback(async () => {
    const p = pendingProviderRef.current;
    clearIntervalRef(pollRef);
    setPendingAuth(null);
    if (p) {
      try {
        await cancelLogin(p);
      } catch {
        // ignore
      }
    }
  }, []);

  const disconnectProvider = useCallback(
    async (provider: string) => {
      await logoutProvider(provider);
      await refresh();
    },
    [refresh],
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
