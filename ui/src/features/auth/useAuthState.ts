import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getAuthProviders,
  getLoginStatus,
  startLogin,
  logoutProvider,
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

export function useAuthState() {
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [pendingAuth, setPendingAuth] = useState<PendingAuth | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const initiateLogin = useCallback(
    async (provider: string) => {
      const dc = await startLogin(provider);
      setPendingAuth({ provider, deviceCode: dc });

      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try {
          const status = await getLoginStatus(provider);
          if (status.status === 'complete') {
            setPendingAuth(null);
            if (pollRef.current) clearInterval(pollRef.current);
            await refresh();
          } else if (status.status === 'expired' || status.status === 'error') {
            setPendingAuth(null);
            if (pollRef.current) clearInterval(pollRef.current);
          }
        } catch {
          // ignore poll failures
        }
      }, (dc.interval || 5) * 1000);
    },
    [refresh],
  );

  const cancelPendingAuth = useCallback(() => {
    setPendingAuth(null);
    if (pollRef.current) clearInterval(pollRef.current);
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
      if (pollRef.current) clearInterval(pollRef.current);
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
