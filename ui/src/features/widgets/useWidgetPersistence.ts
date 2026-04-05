import { useState, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { getUserSettings, getWidgets, putWidgets } from '@/api/mirrorApi';
import { widgetFromBackend, widgetToBackend } from '@/api/transforms';
import { applyUserSettings } from '@/userSettings';
import type { WidgetConfig } from './types';
import { INITIAL_WIDGETS, WIDGET_STORAGE_KEY } from './constants';

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
              setWidgets(parsed.widgets);
              lastPutSig.current = JSON.stringify(parsed.widgets.map(widgetToBackend));
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
    const timer = window.setTimeout(async () => {
      try {
        const out = await putWidgets(widgets.map(widgetToBackend));
        const mapped = out.map(widgetFromBackend);
        lastPutSig.current = JSON.stringify(mapped.map(widgetToBackend));
        setWidgets(mapped);
      } catch (e) {
        console.warn('Failed to sync widgets to server', e);
      }
    }, 600);
    return () => window.clearTimeout(timer);
  }, [widgets, ready, serverConnected]);

  return { widgets, setWidgets, ready, serverConnected };
}
