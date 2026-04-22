import { useCallback, useEffect, useRef, useState } from 'react';
import {
  cancelLoginWithPairing,
  getAuthProviders,
  getLoginStatusWithPairing,
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
  owner_user_uid?: string | null;
  owner_email?: string | null;
  is_current_user_owner?: boolean;
  can_manage?: boolean;
  can_disconnect?: boolean;
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
  pairingId: string | null;
  deviceCode: DeviceCodeInfo;
  targetUserId: string | null;
  intent: 'pair_profile' | 'create_account';
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
  onAuthCompleted?: (payload: {
    provider: string;
    pairingId: string | null;
    intent: string | null;
    pairedUserUid: string | null;
  }) => void | Promise<void>;
};

export function useAuthState({ hardwareId, userId, enabled = true, onAuthCompleted }: AuthContext) {
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [pendingAuth, setPendingAuth] = useState<PendingAuth | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingProviderRef = useRef<string | null>(null);
  const pendingTargetUserIdRef = useRef<string | null>(null);
  const pendingPairingIdRef = useRef<string | null>(null);

  useEffect(() => {
    pendingProviderRef.current = pendingAuth?.provider ?? null;
    pendingTargetUserIdRef.current = pendingAuth?.targetUserId ?? null;
    pendingPairingIdRef.current = pendingAuth?.pairingId ?? null;
  }, [pendingAuth]);

  const canRefreshProviders = enabled && Boolean(hardwareId);

  const refresh = useCallback(async () => {
    if (!canRefreshProviders || !hardwareId) {
      setProviders([]);
      return;
    }
    try {
      const list = await getAuthProviders(hardwareId, userId);
      setProviders(list);
    } catch {
      // Backend unavailable; keep stale state.
    }
  }, [canRefreshProviders, hardwareId, userId]);

  useEffect(() => {
    if (!enabled || !hardwareId) {
      clearIntervalRef(pollRef);
      setPendingAuth(null);
      setProviders([]);
      return;
    }
    void refresh();
  }, [enabled, hardwareId, refresh]);

  useIntervalWhen(() => void refresh(), 10_000, canRefreshProviders);

  const startPollForProvider = useCallback(
    (provider: string, intervalSec: number, targetUserId: string | null, pairingId: string | null) => {
      if (!hardwareId) return;
      if (!pairingId && !targetUserId) return;
      clearIntervalRef(pollRef);
      const ms = Math.max(3000, (intervalSec || 5) * 1000);
      pollRef.current = setInterval(async () => {
        try {
          const status = await getLoginStatusWithPairing(provider, hardwareId, targetUserId, pairingId);
          const normalizedStatus = status.status.toLowerCase();
          const inProgress = normalizedStatus === 'pending'
            || normalizedStatus === 'awaiting_app'
            || normalizedStatus === 'awaiting_oauth'
            || normalizedStatus === 'authorized';
          if (normalizedStatus === 'active' || normalizedStatus === 'complete') {
            clearIntervalRef(pollRef);
            setPendingAuth(null);
            await refresh();
            await onAuthCompleted?.({
              provider,
              pairingId: status.pairing_id ?? pairingId ?? null,
              intent: status.intent ?? null,
              pairedUserUid: status.paired_user_uid ?? null,
            });
          } else if (!inProgress) {
            clearIntervalRef(pollRef);
            setPendingAuth(null);
            await refresh();
          }
        } catch {
          // Ignore poll failures and let the next tick retry.
        }
      }, ms);
    },
    [hardwareId, onAuthCompleted, refresh],
  );

  const applyDeviceCodePayload = useCallback(
    (detail: Record<string, unknown>) => {
      const provider = String(detail.provider ?? '');
      if (!provider) return;
      const parsedTarget = String(detail.target_user_id ?? userId ?? '').trim();
      const targetUserId = parsedTarget || null;
      const pairingId = String(detail.pairing_id ?? '').trim() || null;
      if (!pairingId && !targetUserId) return;
      const intent = String(detail.intent ?? '').trim() === 'create_account' ? 'create_account' : 'pair_profile';
      const deviceCode: DeviceCodeInfo = {
        provider,
        verification_uri: String(detail.verification_uri ?? ''),
        user_code: String(detail.user_code ?? ''),
        expires_in: Number(detail.expires_in) || 300,
        interval: Number(detail.interval) || 5,
        message: detail.message == null ? null : String(detail.message),
      };
      setPendingAuth({ provider, pairingId, deviceCode, targetUserId, intent });
      startPollForProvider(provider, deviceCode.interval, targetUserId, pairingId);
    },
    [startPollForProvider, userId],
  );

  useWindowEvent<Record<string, unknown>>('mirror:oauth_device_code', (detail) => {
    if (!enabled || !hardwareId) return;
    applyDeviceCodePayload(detail ?? {});
  });

  const initiateLogin = useCallback(
    async (provider: string, opts?: { targetUserId?: string; intent?: 'pair_profile' | 'create_account' }) => {
      const targetUserId = opts?.targetUserId?.trim() || userId || undefined;
      if (!hardwareId) {
        throw new Error('Mirror hardware context is unavailable.');
      }
      const intent = opts?.intent ?? 'pair_profile';
      const deviceCode = await startLogin(provider, hardwareId, targetUserId, { targetUserId, intent });
      const resolvedTargetUserId = deviceCode.target_user_id?.trim() || targetUserId || null;
      const pairingId = deviceCode.pairing_id?.trim() || null;
      if (!pairingId && !resolvedTargetUserId) {
        throw new Error('Pairing context is missing. Please refresh and try again.');
      }
      setPendingAuth({
        provider,
        pairingId,
        deviceCode: {
          provider,
          verification_uri: deviceCode.verification_uri,
          user_code: deviceCode.user_code,
          expires_in: deviceCode.expires_in,
          interval: deviceCode.interval,
          message: deviceCode.message ?? null,
        },
        targetUserId: resolvedTargetUserId,
        intent,
      });
      startPollForProvider(provider, deviceCode.interval || 5, resolvedTargetUserId, pairingId);
    },
    [hardwareId, startPollForProvider, userId],
  );

  const cancelPendingAuth = useCallback(async () => {
    const provider = pendingProviderRef.current;
    const targetUserId = pendingTargetUserIdRef.current;
    const pairingId = pendingPairingIdRef.current;
    clearIntervalRef(pollRef);
    setPendingAuth(null);
    if (!provider || !hardwareId) return;
    try {
      await cancelLoginWithPairing(provider, hardwareId, targetUserId, pairingId);
    } catch {
      // Ignore cancellation failures.
    }
  }, [hardwareId]);

  const disconnectProvider = useCallback(
    async (provider: string) => {
      if (!hardwareId) return;
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
