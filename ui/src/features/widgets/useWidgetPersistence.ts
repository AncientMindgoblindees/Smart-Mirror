import { useState, useEffect, useRef, useCallback, type Dispatch, type SetStateAction } from 'react';
import { getUserSettings, getWidgets, putWidgets } from '@/api/mirrorApi';
import type { WidgetConfigOut } from '@/api/backendTypes';
import { widgetToBackend } from '@/api/transforms';
import { applyUserSettings } from '@/userSettings';
import type { WidgetConfig } from './types';
import { INITIAL_WIDGETS } from './constants';
import { loadWidgetCache, saveWidgetCache, signatureFromWidgets } from './widgetStorage';
import { mergeRowsToWidgets, serverLayoutFingerprint, widgetsSignature } from './widgetSyncEngine';
import { useIntervalWhen } from '@/hooks/infra/useIntervalWhen';
import { useWindowEvent } from '@/hooks/infra/useWindowEvent';

const POLL_MS = 1200;

export function useWidgetPersistence(): {
  widgets: WidgetConfig[];
  setWidgets: Dispatch<SetStateAction<WidgetConfig[]>>;
  ready: boolean;
  serverConnected: boolean;
} {
  const [widgets, setWidgets] = useState<WidgetConfig[]>(INITIAL_WIDGETS);
  const [ready, setReady] = useState(false);
  const [serverConnected, setServerConnected] = useState(false);
  const lastPutSig = useRef('');
  const lastServerFingerprintRef = useRef('');
  const pendingPushTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const putInFlightRef = useRef(false);

  const mergeServerRows = useCallback((list: WidgetConfigOut[], opts?: { force?: boolean }) => {
    const fp = serverLayoutFingerprint(list);
    if (!opts?.force && fp === lastServerFingerprintRef.current) return;
    // Avoid reverting local edits while a push is queued or in-flight.
    if (!opts?.force && (putInFlightRef.current || pendingPushTimerRef.current !== undefined)) return;
    lastServerFingerprintRef.current = fp;
    if (pendingPushTimerRef.current !== undefined) {
      clearTimeout(pendingPushTimerRef.current);
      pendingPushTimerRef.current = undefined;
    }
    const mapped = mergeRowsToWidgets(list);
    lastPutSig.current = widgetsSignature(mapped);
    setWidgets(mapped);
  }, []);

  const pullWidgetsFromServer = useCallback(async () => {
    try {
      const list = await getWidgets();
      mergeServerRows(list);
      setServerConnected(true);
    } catch {
      setServerConnected(false);
    }
  }, [mergeServerRows]);

  useEffect(() => {
    let cancelled = false;
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
  }, [mergeServerRows]);

  useIntervalWhen(() => void pullWidgetsFromServer(), 3000, ready && !serverConnected);

  useEffect(() => {
    if (!ready) return;
    saveWidgetCache(widgets);
  }, [widgets, ready]);

  useEffect(() => {
    if (!ready || !serverConnected) return;
    const sig = widgetsSignature(widgets);
    if (sig === lastPutSig.current) return;
    if (pendingPushTimerRef.current !== undefined) clearTimeout(pendingPushTimerRef.current);
    pendingPushTimerRef.current = window.setTimeout(async () => {
      pendingPushTimerRef.current = undefined;
      try {
        putInFlightRef.current = true;
        const out = await putWidgets(widgets.map(widgetToBackend));
        mergeServerRows(out, { force: true });
        setServerConnected(true);
      } catch (e) {
        console.warn('Failed to sync widgets to server', e);
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
  }, [widgets, ready, serverConnected, mergeServerRows]);

  useIntervalWhen(
    () => {
      if (document.visibilityState !== 'visible') return;
      void pullWidgetsFromServer();
    },
    POLL_MS,
    ready && serverConnected,
  );

  useWindowEvent('focus', () => {
    if (!ready || !serverConnected) return;
    void pullWidgetsFromServer();
  });
  useEffect(() => {
    if (!ready || !serverConnected) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') void pullWidgetsFromServer();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [ready, serverConnected, pullWidgetsFromServer]);

  return { widgets, setWidgets, ready, serverConnected };
}
