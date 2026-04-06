import { useState, useEffect, useRef, useCallback, type Dispatch, type SetStateAction } from 'react';
import { getUserSettings, getWidgets, putWidgets } from '@/api/mirrorApi';
import type { WidgetConfigOut } from '@/api/backendTypes';
import { widgetFromBackend, widgetToBackend, normalizeWidgetConfig } from '@/api/transforms';
import { applyUserSettings } from '@/userSettings';
import type { WidgetConfig } from './types';
import { INITIAL_WIDGETS, WIDGET_STORAGE_KEY } from './constants';

const POLL_MS = 5000;

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
  const pendingPushTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const applyRemoteWidgetRows = useCallback((list: WidgetConfigOut[]) => {
    const mapped = list.map(widgetFromBackend);
    const sig = JSON.stringify(mapped.map(widgetToBackend));
    if (sig === lastPutSig.current) return;
    if (pendingPushTimerRef.current !== undefined) {
      clearTimeout(pendingPushTimerRef.current);
      pendingPushTimerRef.current = undefined;
    }
    lastPutSig.current = sig;
    setWidgets(mapped);
  }, []);

  const pullWidgetsFromServer = useCallback(async () => {
    try {
      const list = await getWidgets();
      applyRemoteWidgetRows(list);
    } catch {
      /* ignore */
    }
  }, [applyRemoteWidgetRows]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [settings, list] = await Promise.all([getUserSettings(), getWidgets()]);
        if (cancelled) return;
        applyUserSettings(settings);
        const mapped = list.map(widgetFromBackend);
        lastPutSig.current = JSON.stringify(mapped.map(widgetToBackend));
        setWidgets(mapped);
        setServerConnected(true);
      } catch {
        setServerConnected(false);
        const raw = localStorage.getItem(WIDGET_STORAGE_KEY);
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as { widgets?: WidgetConfig[] };
            if (Array.isArray(parsed.widgets) && parsed.widgets.length > 0) {
              const normalized = parsed.widgets.map((w) => normalizeWidgetConfig(w as WidgetConfig));
              setWidgets(normalized);
              lastPutSig.current = JSON.stringify(normalized.map(widgetToBackend));
            }
          } catch {
            /* ignore */
          }
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(WIDGET_STORAGE_KEY, JSON.stringify({ widgets }));
  }, [widgets, ready]);

  useEffect(() => {
    if (!ready || !serverConnected) return;
    const sig = JSON.stringify(widgets.map(widgetToBackend));
    if (sig === lastPutSig.current) return;
    if (pendingPushTimerRef.current !== undefined) clearTimeout(pendingPushTimerRef.current);
    pendingPushTimerRef.current = window.setTimeout(async () => {
      pendingPushTimerRef.current = undefined;
      try {
        const out = await putWidgets(widgets.map(widgetToBackend));
        const mapped = out.map(widgetFromBackend);
        lastPutSig.current = JSON.stringify(mapped.map(widgetToBackend));
        setWidgets(mapped);
      } catch (e) {
        console.warn('Failed to sync widgets to server', e);
      }
    }, 600);
    return () => {
      if (pendingPushTimerRef.current !== undefined) {
        clearTimeout(pendingPushTimerRef.current);
        pendingPushTimerRef.current = undefined;
      }
    };
  }, [widgets, ready, serverConnected]);

  useEffect(() => {
    if (!ready || !serverConnected) return;
    const id = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void pullWidgetsFromServer();
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [ready, serverConnected, pullWidgetsFromServer]);

  useEffect(() => {
    if (!ready || !serverConnected) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') void pullWidgetsFromServer();
    };
    const onFocus = () => void pullWidgetsFromServer();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
    };
  }, [ready, serverConnected, pullWidgetsFromServer]);

  return { widgets, setWidgets, ready, serverConnected };
}
