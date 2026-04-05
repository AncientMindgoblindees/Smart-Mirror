import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { WidgetConfig } from './types';
import { WidgetFrame } from './components/WidgetFrame';
import { ToolsPanel } from './components/ToolsPanel';
import { CameraOverlay } from './components/CameraOverlay';
import { getUserSettings, getWidgets, putWidgets } from './api/mirrorApi';
import { widgetFromBackend, widgetToBackend } from './api/transforms';
import { applyUserSettings } from './userSettings';
import { useMirrorInput } from './hooks/useMirrorInput';
import './App.css';

const STORAGE_KEY = 'mirror_dashboard_config';
const DEV_PANEL_STORAGE_KEY = 'mirror_show_dev_panel';

const INITIAL_WIDGETS: WidgetConfig[] = [
  {
    id: 'w1',
    type: 'clock',
    enabled: true,
    grid: { row: 1, col: 1, rowSpan: 1, colSpan: 2 },
    freeform: { x: 50, y: 50, width: 400, height: 200 },
  },
  {
    id: 'w2',
    type: 'weather',
    enabled: true,
    grid: { row: 1, col: 3, rowSpan: 1, colSpan: 1 },
    freeform: { x: 500, y: 50, width: 250, height: 200 },
  },
  {
    id: 'w3',
    type: 'calendar',
    enabled: true,
    grid: { row: 2, col: 1, rowSpan: 2, colSpan: 1 },
    freeform: { x: 50, y: 300, width: 300, height: 400 },
  },
];

function readDevPanelInitial(): boolean {
  try {
    const v = localStorage.getItem(DEV_PANEL_STORAGE_KEY);
    if (v === 'false') return false;
  } catch {
    /* ignore */
  }
  return true;
}

export default function App() {
  const [widgets, setWidgets] = useState<WidgetConfig[]>(INITIAL_WIDGETS);
  const [showCamera, setShowCamera] = useState(false);
  const [displayDimmed, setDisplayDimmed] = useState(false);
  const [sleepMode, setSleepMode] = useState(false);
  const [showDevPanel, setShowDevPanel] = useState(readDevPanelInitial);
  const [ready, setReady] = useState(false);
  const [serverConnected, setServerConnected] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasRect, setCanvasRect] = useState<DOMRect | null>(null);
  const lastPutSig = useRef<string>('');
  const sleepModeRef = useRef(false);
  sleepModeRef.current = sleepMode;

  useEffect(() => {
    document.body.classList.toggle('mirror-display-dimmed', displayDimmed && !sleepMode);
    return () => document.body.classList.remove('mirror-display-dimmed');
  }, [displayDimmed, sleepMode]);

  useEffect(() => {
    document.body.classList.toggle('mirror-sleep', sleepMode);
    return () => document.body.classList.remove('mirror-sleep');
  }, [sleepMode]);

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
        const raw = localStorage.getItem(STORAGE_KEY);
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ widgets }));
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

  useEffect(() => {
    const updateRect = () => {
      if (canvasRef.current) setCanvasRect(canvasRef.current.getBoundingClientRect());
    };
    updateRect();
    window.addEventListener('resize', updateRect);
    return () => window.removeEventListener('resize', updateRect);
  }, []);

  const toggleDevPanel = useCallback(() => {
    setShowDevPanel((v) => {
      const next = !v;
      try {
        localStorage.setItem(DEV_PANEL_STORAGE_KEY, String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const toggleDim = useCallback(() => {
    setDisplayDimmed((d) => !d);
  }, []);

  const toggleSleep = useCallback(() => {
    setSleepMode((s) => !s);
  }, []);

  useMirrorInput({
    toggleDim,
    toggleSleep,
    toggleDevPanel,
    getSleepMode: () => sleepModeRef.current,
  });

  const updateWidget = (id: string, updates: Partial<WidgetConfig>) => {
    setWidgets((prev) => prev.map((w) => (w.id === id ? { ...w, ...updates } : w)));
  };

  const toggleWidget = (id: string) => {
    setWidgets((prev) => prev.map((w) => (w.id === id ? { ...w, enabled: !w.enabled } : w)));
  };

  const visibleWidgets = useMemo(() => widgets.filter((w) => w.enabled), [widgets]);

  return (
    <div className="mirror-shell">
      <div ref={canvasRef} className="mirror-canvas mirror-canvas-freeform">
        {visibleWidgets.map((w) => (
          <WidgetFrame key={w.id} config={w} onUpdate={updateWidget} canvasRect={canvasRect} />
        ))}
      </div>

      {showDevPanel && (
        <ToolsPanel
          onToggleCamera={() => setShowCamera((v) => !v)}
          onToggleDim={toggleDim}
          onToggleSleep={toggleSleep}
          widgets={widgets}
          onToggleWidget={toggleWidget}
        />
      )}

      {showCamera && <CameraOverlay onClose={() => setShowCamera(false)} />}

      {sleepMode && (
        <div className="mirror-sleep-overlay" aria-hidden="true">
          <span className="mirror-sleep-hint">Sleep — press any key to wake</span>
        </div>
      )}
    </div>
  );
}
