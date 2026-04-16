import { useState, useEffect, useRef, useCallback, type Dispatch, type SetStateAction } from 'react';
import { getUserSettings, getWidgets, putWidgets } from '@/api/mirrorApi';
import type { WidgetConfigOut } from '@/api/backendTypes';
import {
  widgetFromBackend,
  widgetToBackend,
  normalizeWidgetConfig,
  dedupeWidgetRows,
} from '@/api/transforms';
import { applyUserSettings } from '@/userSettings';
import type { WidgetConfig } from './types';
import { INITIAL_WIDGETS, WIDGET_STORAGE_KEY } from './constants';

const POLL_MS = 1200;

/** Stable fingerprint from raw API rows so companion edits are detected (avoids round-trip JSON mismatches). */
function serverLayoutFingerprint(rows: WidgetConfigOut[]): string {
  return JSON.stringify(
    rows
      .map((r) => ({
        id: r.id,
        widget_id: r.widget_id,
        enabled: r.enabled,
        position_row: r.position_row,
        position_col: r.position_col,
        size_rows: r.size_rows,
        size_cols: r.size_cols,
        config_json: r.config_json,
        updated_at: r.updated_at,
      }))
      .sort((a, b) => a.id - b.id)
  );
}

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
    const deduped = dedupeWidgetRows(list);
    const fp = serverLayoutFingerprint(deduped);
    if (!opts?.force && fp === lastServerFingerprintRef.current) return;
    // Avoid reverting local edits while a push is queued or in-flight.
    if (!opts?.force && (putInFlightRef.current || pendingPushTimerRef.current !== undefined)) return;
    lastServerFingerprintRef.current = fp;
    if (pendingPushTimerRef.current !== undefined) {
      clearTimeout(pendingPushTimerRef.current);
      pendingPushTimerRef.current = undefined;
    }
    const mapped = deduped.map(widgetFromBackend);
    lastPutSig.current = JSON.stringify(mapped.map(widgetToBackend));
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
        const raw = localStorage.getItem(WIDGET_STORAGE_KEY);
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as { widgets?: WidgetConfig[] };
            if (Array.isArray(parsed.widgets) && parsed.widgets.length > 0) {
              const normalized = parsed.widgets.map((w) => normalizeWidgetConfig(w as WidgetConfig));
              setWidgets(normalized);
              lastPutSig.current = JSON.stringify(normalized.map(widgetToBackend));
              lastServerFingerprintRef.current = '';
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
  }, [mergeServerRows]);

  useEffect(() => {
    if (!ready || serverConnected) return;
    const id = window.setInterval(() => {
      void pullWidgetsFromServer();
    }, 3000);
    return () => window.clearInterval(id);
  }, [ready, serverConnected, pullWidgetsFromServer]);

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
