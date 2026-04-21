import { useState, useEffect, useRef, useCallback, type Dispatch, type SetStateAction } from 'react';

import type { WidgetConfigOut } from '@/api/backendTypes';
import { getUserSettings, getWidgets, putWidgets } from '@/api/mirrorApi';
import { widgetToBackend } from '@/api/transforms';
import { useIntervalWhen } from '@/hooks/infra/useIntervalWhen';
import { useWindowEvent } from '@/hooks/infra/useWindowEvent';
import { applyUserSettings } from '@/userSettings';
import { INITIAL_WIDGETS } from './constants';
import { mergeRowsToWidgets, serverLayoutFingerprint, widgetsSignature } from './widgetSyncEngine';
import { loadWidgetCache, saveWidgetCache, signatureFromWidgets } from './widgetStorage';
import type { WidgetConfig } from './types';

const POLL_MS = 1200;

type UseWidgetPersistenceOptions = {
  enabled?: boolean;
  refreshKey?: string;
};

export function useWidgetPersistence(options: UseWidgetPersistenceOptions = {}): {
  widgets: WidgetConfig[];
  setWidgets: Dispatch<SetStateAction<WidgetConfig[]>>;
  ready: boolean;
  serverConnected: boolean;
} {
  const { enabled = true, refreshKey = 'default' } = options;
  const [widgets, setWidgets] = useState<WidgetConfig[]>(INITIAL_WIDGETS);
  const [ready, setReady] = useState(false);
  const [serverConnected, setServerConnected] = useState(false);
  const lastPutSig = useRef('');
  const lastServerFingerprintRef = useRef('');
  const pendingPushTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const putInFlightRef = useRef(false);

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

  const pullWidgetsFromServer = useCallback(async () => {
    if (!enabled) return;
    try {
      const list = await getWidgets();
      mergeServerRows(list);
      setServerConnected(true);
    } catch {
      setServerConnected(false);
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
    if (pendingPushTimerRef.current !== undefined) {
      clearTimeout(pendingPushTimerRef.current);
      pendingPushTimerRef.current = undefined;
    }

    (async () => {
      try {
        const [settings, list] = await Promise.all([getUserSettings(), getWidgets()]);
        if (cancelled) return;
        applyUserSettings(settings);
        mergeServerRows(list, { force: true });
        setServerConnected(true);
      } catch {
        setServerConnected(false);
        const cached = loadWidgetCache();
        if (cached) {
          setWidgets(cached);
          lastPutSig.current = signatureFromWidgets(cached);
          lastServerFingerprintRef.current = '';
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, mergeServerRows, refreshKey]);

  useIntervalWhen(() => void pullWidgetsFromServer(), 3000, enabled && ready && !serverConnected);

  useEffect(() => {
    if (!enabled || !ready) return;
    saveWidgetCache(widgets);
  }, [enabled, ready, widgets]);

  useEffect(() => {
    if (!enabled || !ready || !serverConnected) return;
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
  }, [enabled, widgets, ready, serverConnected, mergeServerRows]);

  useIntervalWhen(
    () => {
      if (document.visibilityState !== 'visible') return;
      void pullWidgetsFromServer();
    },
    POLL_MS,
    enabled && ready && serverConnected,
  );

  useWindowEvent('focus', () => {
    if (!enabled || !ready || !serverConnected) return;
    void pullWidgetsFromServer();
  });

  useEffect(() => {
    if (!enabled || !ready || !serverConnected) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void pullWidgetsFromServer();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [enabled, ready, serverConnected, pullWidgetsFromServer]);

  return { widgets, setWidgets, ready, serverConnected };
}
