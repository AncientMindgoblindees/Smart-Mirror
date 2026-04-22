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

type AuthIntent = PendingAuth['intent'];

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

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function clearTimerRef(timerRef: { current: ReturnType<typeof setTimeout> | null }) {
  if (timerRef.current) {
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }
}

function resolveIntent(value: unknown, fallback: AuthIntent = 'pair_profile'): AuthIntent {
  return value === 'create_account' ? 'create_account' : fallback;
}

export function useAuthState({ hardwareId, userId, enabled = true, onAuthCompleted }: AuthContext) {
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [pendingAuth, setPendingAuth] = useState<PendingAuth | null>(null);

  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollSequenceRef = useRef(0);
  const loginStatusAbortRef = useRef<AbortController | null>(null);
  const providerRefreshAbortRef = useRef<AbortController | null>(null);
  const providerRefreshInFlightRef = useRef(false);
  const providerRefreshQueuedRef = useRef(false);
  const pendingProviderRef = useRef<string | null>(null);
  const pendingTargetUserIdRef = useRef<string | null>(null);
  const pendingPairingIdRef = useRef<string | null>(null);
  const pendingIntentRef = useRef<AuthIntent>('pair_profile');
  const pendingAuthRef = useRef<PendingAuth | null>(null);

  useEffect(() => {
    pendingAuthRef.current = pendingAuth;
    pendingProviderRef.current = pendingAuth?.provider ?? null;
    pendingTargetUserIdRef.current = pendingAuth?.targetUserId ?? null;
    pendingPairingIdRef.current = pendingAuth?.pairingId ?? null;
    if (pendingAuth?.intent) pendingIntentRef.current = pendingAuth.intent;
  }, [pendingAuth]);

  const canRefreshProviders = enabled && Boolean(hardwareId);

  const clearStatusPolling = useCallback(() => {
    pollSequenceRef.current += 1;
    clearTimerRef(pollTimerRef);
    loginStatusAbortRef.current?.abort();
    loginStatusAbortRef.current = null;
  }, []);

  const refresh = useCallback(
    async (opts?: { force?: boolean }) => {
      if (!canRefreshProviders || !hardwareId) {
        providerRefreshAbortRef.current?.abort();
        providerRefreshAbortRef.current = null;
        providerRefreshQueuedRef.current = false;
        providerRefreshInFlightRef.current = false;
        setProviders([]);
        return;
      }

      if (providerRefreshInFlightRef.current) {
        providerRefreshQueuedRef.current = true;
        return;
      }

      const controller = new AbortController();
      providerRefreshAbortRef.current?.abort();
      providerRefreshAbortRef.current = controller;
      providerRefreshInFlightRef.current = true;

      try {
        const list = await getAuthProviders(hardwareId, userId, { signal: controller.signal });
        if (providerRefreshAbortRef.current === controller) {
          setProviders(list);
        }
      } catch (error) {
        if (!isAbortError(error)) {
          // Backend unavailable; keep stale state.
        }
      } finally {
        if (providerRefreshAbortRef.current === controller) {
          providerRefreshAbortRef.current = null;
        }
        providerRefreshInFlightRef.current = false;
        if (providerRefreshQueuedRef.current && (opts?.force ?? true)) {
          providerRefreshQueuedRef.current = false;
          void refresh({ force: true });
        } else {
          providerRefreshQueuedRef.current = false;
        }
      }
    },
    [canRefreshProviders, hardwareId, userId],
  );

  const pollLoginStatus = useCallback(
    async (provider: string, targetUserId: string | null, pairingId: string | null) => {
      if (!hardwareId) return;

      loginStatusAbortRef.current?.abort();
      const controller = new AbortController();
      loginStatusAbortRef.current = controller;

      try {
        const status = await getLoginStatusWithPairing(
          provider,
          hardwareId,
          targetUserId,
          pairingId,
          { signal: controller.signal },
        );
        const normalizedStatus = status.status.toLowerCase();
        const inProgress = normalizedStatus === 'pending'
          || normalizedStatus === 'awaiting_app'
          || normalizedStatus === 'awaiting_oauth'
          || normalizedStatus === 'authorized';

        if (normalizedStatus === 'active' || normalizedStatus === 'complete') {
          clearStatusPolling();
          setPendingAuth(null);
          await refresh({ force: true });
          await onAuthCompleted?.({
            provider,
            pairingId: status.pairing_id ?? pairingId ?? null,
            intent: status.intent ?? pendingIntentRef.current,
            pairedUserUid: status.paired_user_uid ?? null,
          });
          return;
        }

        if (!inProgress) {
          clearStatusPolling();
          setPendingAuth(null);
          await refresh({ force: true });
        }
      } catch (error) {
        if (!isAbortError(error)) {
          // Ignore transient poll failures and let the next scheduled tick retry.
        }
      } finally {
        if (loginStatusAbortRef.current === controller) {
          loginStatusAbortRef.current = null;
        }
      }
    },
    [clearStatusPolling, hardwareId, onAuthCompleted, refresh],
  );

  const startPollForProvider = useCallback(
    (provider: string, intervalSec: number, targetUserId: string | null, pairingId: string | null) => {
      if (!hardwareId) return;
      if (!pairingId && !targetUserId) return;

      clearStatusPolling();
      const pollSequence = pollSequenceRef.current;

      const runPoll = () => {
        void pollLoginStatus(provider, targetUserId, pairingId).finally(() => {
          if (pollSequenceRef.current !== pollSequence) return;
          const activePending = pendingAuthRef.current;
          if (!activePending || activePending.provider !== provider) return;
          const ms = Math.max(3000, (intervalSec || activePending.deviceCode.interval || 5) * 1000);
          pollTimerRef.current = window.setTimeout(runPoll, ms);
        });
      };

      pollTimerRef.current = window.setTimeout(runPoll, 0);
    },
    [clearStatusPolling, hardwareId, pollLoginStatus],
  );

  const applyDeviceCodePayload = useCallback(
    (detail: Record<string, unknown>) => {
      const provider = String(detail.provider ?? '').trim();
      if (!provider) return;

      const parsedTarget = String(detail.target_user_id ?? userId ?? '').trim();
      const targetUserId = parsedTarget || null;
      const pairingId = String(detail.pairing_id ?? '').trim() || null;
      if (!pairingId && !targetUserId) return;

      const fallbackIntent =
        pendingProviderRef.current === provider ? pendingIntentRef.current : 'pair_profile';
      const intent = resolveIntent(detail.intent, fallbackIntent);
      const deviceCode: DeviceCodeInfo = {
        provider,
        verification_uri: String(detail.verification_uri ?? ''),
        user_code: String(detail.user_code ?? ''),
        expires_in: Number(detail.expires_in) || 300,
        interval: Number(detail.interval) || 5,
        message: detail.message == null ? null : String(detail.message),
      };

      pendingIntentRef.current = intent;
      setPendingAuth({ provider, pairingId, deviceCode, targetUserId, intent });
      startPollForProvider(provider, deviceCode.interval, targetUserId, pairingId);
    },
    [startPollForProvider, userId],
  );

  useEffect(() => {
    if (!enabled || !hardwareId) {
      clearStatusPolling();
      providerRefreshAbortRef.current?.abort();
      providerRefreshAbortRef.current = null;
      setPendingAuth(null);
      setProviders([]);
      return;
    }

    setProviders([]);
    void refresh({ force: true });
  }, [clearStatusPolling, enabled, hardwareId, refresh]);

  useIntervalWhen(() => void refresh(), 10_000, canRefreshProviders);

  useWindowEvent<Record<string, unknown>>('mirror:oauth_device_code', (detail) => {
    if (!enabled || !hardwareId) return;
    applyDeviceCodePayload(detail ?? {});
  });

  const initiateLogin = useCallback(
    async (provider: string, opts?: { targetUserId?: string; intent?: AuthIntent }) => {
      const requestedTargetUserId = opts?.targetUserId?.trim() || userId || undefined;
      if (!hardwareId) {
        throw new Error('Mirror hardware context is unavailable.');
      }

      const requestedIntent = resolveIntent(opts?.intent);
      pendingIntentRef.current = requestedIntent;

      const deviceCode = await startLogin(
        provider,
        hardwareId,
        requestedTargetUserId,
        { targetUserId: requestedTargetUserId, intent: requestedIntent },
      );
      const resolvedTargetUserId = deviceCode.target_user_id?.trim() || requestedTargetUserId || null;
      const pairingId = deviceCode.pairing_id?.trim() || null;
      if (!pairingId && !resolvedTargetUserId) {
        throw new Error('Pairing context is missing. Please refresh and try again.');
      }

      const intent = resolveIntent(deviceCode.intent, requestedIntent);
      const nextPendingAuth: PendingAuth = {
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
      };

      pendingIntentRef.current = intent;
      setPendingAuth(nextPendingAuth);
      startPollForProvider(provider, deviceCode.interval || 5, resolvedTargetUserId, pairingId);
    },
    [hardwareId, startPollForProvider, userId],
  );

  const cancelPendingAuth = useCallback(async () => {
    const provider = pendingProviderRef.current;
    const targetUserId = pendingTargetUserIdRef.current;
    const pairingId = pendingPairingIdRef.current;

    clearStatusPolling();
    setPendingAuth(null);
    if (!provider || !hardwareId) return;

    try {
      await cancelLoginWithPairing(provider, hardwareId, targetUserId, pairingId);
    } catch {
      // Ignore cancellation failures.
    }
  }, [clearStatusPolling, hardwareId]);

  const disconnectProvider = useCallback(
    async (provider: string) => {
      if (!hardwareId) return;
      await logoutProvider(provider, hardwareId, userId);
      await refresh({ force: true });
    },
    [hardwareId, refresh, userId],
  );

  useEffect(() => {
    return () => {
      clearStatusPolling();
      providerRefreshAbortRef.current?.abort();
      providerRefreshAbortRef.current = null;
    };
  }, [clearStatusPolling]);

  return {
    providers,
    pendingAuth,
    initiateLogin,
    cancelPendingAuth,
    disconnectProvider,
    refresh,
  };
}
