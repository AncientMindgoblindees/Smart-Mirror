import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  WidgetFrame,
  useWidgetPersistence,
  DEV_PANEL_STORAGE_KEY,
  LAYOUT_MODE_STORAGE_KEY,
  LAYOUT_PRESETS,
} from '@/features/widgets';
import type { WidgetConfig } from '@/features/widgets/types';
import { ToolsPanel } from '@/features/dev-panel';
import { CameraOverlay } from '@/features/camera';
import { useMirrorInput } from '@/hooks/useMirrorInput';
import './mirror-app.css';

function readDevPanelInitial(): boolean {
  try {
    const v = localStorage.getItem(DEV_PANEL_STORAGE_KEY);
    if (v === 'false') return false;
  } catch {
    /* ignore */
  }
  return true;
}

function readLayoutModeInitial(): number {
  try {
    const raw = localStorage.getItem(LAYOUT_MODE_STORAGE_KEY);
    if (!raw) return 0;
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n) && n >= 0) return n % Math.max(1, LAYOUT_PRESETS.length);
  } catch {
    /* ignore */
  }
  return 0;
}

function baseType(type: string): string {
  const raw = (type || '').trim().toLowerCase();
  const idx = raw.indexOf(':');
  return idx > 0 ? raw.slice(0, idx) : raw;
}

export default function MirrorApp() {
  const { widgets, setWidgets } = useWidgetPersistence();
  const [showCamera, setShowCamera] = useState(false);
  const [displayDimmed, setDisplayDimmed] = useState(false);
  const [sleepMode, setSleepMode] = useState(false);
  const [showDevPanel, setShowDevPanel] = useState(readDevPanelInitial);
  const [layoutModeIndex, setLayoutModeIndex] = useState(readLayoutModeInitial);

  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasRect, setCanvasRect] = useState<DOMRect | null>(null);
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
    try {
      localStorage.setItem(LAYOUT_MODE_STORAGE_KEY, String(layoutModeIndex));
    } catch {
      /* ignore */
    }
  }, [layoutModeIndex]);

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

  const cycleLayout = useCallback(() => {
    setLayoutModeIndex((prev) => {
      const next = (prev + 1) % Math.max(1, LAYOUT_PRESETS.length);
      const preset = LAYOUT_PRESETS[next];
      setWidgets((list) =>
        list.map((w) => {
          const p = preset[baseType(w.type)];
          return p ? { ...w, freeform: { ...p } } : w;
        })
      );
      return next;
    });
  }, [setWidgets]);

  useMirrorInput({
    cycleLayout,
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
          layoutModeIndex={layoutModeIndex}
          onCycleLayout={cycleLayout}
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
