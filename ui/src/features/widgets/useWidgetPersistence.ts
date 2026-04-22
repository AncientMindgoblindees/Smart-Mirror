import { useState, useEffect, useRef, useCallback, type Dispatch, type SetStateAction } from 'react';

import type { UserSettingsOut, WidgetConfigOut } from '@/api/backendTypes';
import { getUserSettings, getWidgets, putWidgets } from '@/api/mirrorApi';
import { widgetToBackend } from '@/api/transforms';
import { useIntervalWhen } from '@/hooks/infra/useIntervalWhen';
import { useWindowEvent } from '@/hooks/infra/useWindowEvent';
import { applyUserSettings } from '@/userSettings';
import { INITIAL_WIDGETS } from './constants';
import { mergeRowsToWidgets, serverLayoutFingerprint, widgetsSignature } from './widgetSyncEngine';
import { loadWidgetCache, saveWidgetCache, signatureFromWidgets } from './widgetStorage';
import type { WidgetConfig } from './types';

const CONNECTED_POLL_MS = 2500;

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

type UseWidgetPersistenceOptions = {
  enabled?: boolean;
  syncEnabled?: boolean;
  refreshKey?: string;
  initialWidgets?: WidgetConfigOut[] | null;
  initialUserSettings?: UserSettingsOut | null;
};

export function useWidgetPersistence(options: UseWidgetPersistenceOptions = {}): {
  widgets: WidgetConfig[];
  setWidgets: Dispatch<SetStateAction<WidgetConfig[]>>;
  ready: boolean;
  serverConnected: boolean;
} {
  const {
    enabled = true,
    syncEnabled = true,
    refreshKey = 'default',
    initialWidgets = null,
    initialUserSettings = null,
  } = options;
  const [widgets, setWidgets] = useState<WidgetConfig[]>(INITIAL_WIDGETS);
  const [ready, setReady] = useState(false);
  const [serverConnected, setServerConnected] = useState(false);
  const lastPutSig = useRef('');
  const lastServerFingerprintRef = useRef('');
  const pendingPushTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const putInFlightRef = useRef(false);
  const pullAbortRef = useRef<AbortController | null>(null);
  const initAbortRef = useRef<AbortController | null>(null);
  const pullInFlightRef = useRef(false);
  const pullQueuedRef = useRef(false);

  const mergeServerRows = useCallback((list: WidgetConfigOut[], opts?: { force?: boolean }) => {
    const fingerprint = serverLayoutFingerprint(list);
    if (!opts?.force && fingerprint === lastServerFingerprintRef.current) return;
    if (!opts?.force && (putInFlightRef.current || pendingPushTimerRef.current !== undefined)) return;

    lastServerFingerprintRef.current = fingerprint;
    if (pendingPushTimerRef.current !== undefined) {
      clearTimeout(pendingPushTimerRef.current);
      pendingPushTimerRef.current = undefined;
    }

    const mapped = mergeRowsToWidgets(list);
    lastPutSig.current = widgetsSignature(mapped);
    setWidgets(mapped);
  }, []);

  const pullWidgetsFromServer = useCallback(async (opts?: { force?: boolean }) => {
    if (!enabled) return;
    if (pullInFlightRef.current) {
      if (opts?.force) {
        pullQueuedRef.current = true;
      }
      return;
    }

    const controller = new AbortController();
    pullAbortRef.current?.abort();
    pullAbortRef.current = controller;
    pullInFlightRef.current = true;

    try {
      const list = await getWidgets({ signal: controller.signal });
      mergeServerRows(list);
      setServerConnected(true);
    } catch (error) {
      if (!isAbortError(error)) {
        setServerConnected(false);
      }
    } finally {
      if (pullAbortRef.current === controller) {
        pullAbortRef.current = null;
      }
      pullInFlightRef.current = false;
      if (pullQueuedRef.current) {
        pullQueuedRef.current = false;
        void pullWidgetsFromServer();
      }
    }
  }, [enabled, mergeServerRows]);

  useEffect(() => {
    let cancelled = false;

    if (!enabled) {
      setReady(true);
      setServerConnected(false);
      setWidgets(INITIAL_WIDGETS);
      return () => {
        cancelled = true;
      };
    }

    setReady(false);
    setWidgets(INITIAL_WIDGETS);
    lastPutSig.current = '';
    lastServerFingerprintRef.current = '';
    pullAbortRef.current?.abort();
    pullAbortRef.current = null;
    pullInFlightRef.current = false;
    pullQueuedRef.current = false;
    initAbortRef.current?.abort();
    if (pendingPushTimerRef.current !== undefined) {
      clearTimeout(pendingPushTimerRef.current);
      pendingPushTimerRef.current = undefined;
    }

    (async () => {
      const controller = new AbortController();
      initAbortRef.current = controller;
      try {
        const [settings, list] = initialWidgets && initialUserSettings
          ? [initialUserSettings, initialWidgets]
          : await Promise.all([
              getUserSettings({ signal: controller.signal }),
              getWidgets({ signal: controller.signal }),
            ]);
        if (cancelled) return;
        applyUserSettings(settings);
        mergeServerRows(list, { force: true });
        setServerConnected(true);
      } catch (error) {
        if (!isAbortError(error)) {
          setServerConnected(false);
          const cached = loadWidgetCache();
          if (cached) {
            setWidgets(cached);
            lastPutSig.current = signatureFromWidgets(cached);
            lastServerFingerprintRef.current = '';
          }
        }
      } finally {
        if (initAbortRef.current === controller) {
          initAbortRef.current = null;
        }
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
      initAbortRef.current?.abort();
      initAbortRef.current = null;
      pullAbortRef.current?.abort();
      pullAbortRef.current = null;
    };
  }, [enabled, initialUserSettings, initialWidgets, mergeServerRows, refreshKey]);

  useIntervalWhen(() => void pullWidgetsFromServer(), 3000, enabled && syncEnabled && ready && !serverConnected);

  useEffect(() => {
    if (!enabled || !ready) return;
    saveWidgetCache(widgets);
  }, [enabled, ready, widgets]);

  useEffect(() => {
    if (!enabled || !syncEnabled || !ready || !serverConnected) return;
    const signature = widgetsSignature(widgets);
    if (signature === lastPutSig.current) return;

    if (pendingPushTimerRef.current !== undefined) clearTimeout(pendingPushTimerRef.current);
    pendingPushTimerRef.current = window.setTimeout(async () => {
      pendingPushTimerRef.current = undefined;
      try {
        putInFlightRef.current = true;
        const out = await putWidgets(widgets.map(widgetToBackend));
        mergeServerRows(out, { force: true });
        setServerConnected(true);
      } catch (error) {
        console.warn('Failed to sync widgets to server', error);
        setServerConnected(false);
      } finally {
        putInFlightRef.current = false;
      }
    }, 250);

    return () => {
      if (pendingPushTimerRef.current !== undefined) {
        clearTimeout(pendingPushTimerRef.current);
        pendingPushTimerRef.current = undefined;
      }
    };
  }, [enabled, syncEnabled, widgets, ready, serverConnected, mergeServerRows]);

  useIntervalWhen(
    () => {
      if (document.visibilityState !== 'visible') return;
      void pullWidgetsFromServer({ force: true });
    },
    CONNECTED_POLL_MS,
    enabled && syncEnabled && ready && serverConnected,
  );

  useWindowEvent('focus', () => {
    if (!enabled || !syncEnabled || !ready || !serverConnected) return;
    void pullWidgetsFromServer({ force: true });
  });

  useEffect(() => {
    if (!enabled || !syncEnabled || !ready || !serverConnected) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void pullWidgetsFromServer({ force: true });
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [enabled, syncEnabled, ready, serverConnected, pullWidgetsFromServer]);

  return { widgets, setWidgets, ready, serverConnected };
}
