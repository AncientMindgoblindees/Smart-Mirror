import React, { useRef } from 'react';
import { GripVertical } from 'lucide-react';
import type { WidgetConfig } from './types';
import { getWidgetMetadata, UnknownWidget } from './registry';
import './widget-frame.css';

interface Props {
  config: WidgetConfig;
  onUpdate: (id: string, updates: Partial<WidgetConfig>) => void;
  canvasRect: DOMRect | null;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export const WidgetFrame: React.FC<Props> = ({ config, onUpdate, canvasRect }) => {
  const metadata = getWidgetMetadata(config.type);
  const Body = metadata?.Component ?? UnknownWidget;
  const title =
    config.title?.trim() ||
    (config.type.startsWith('custom:') ? 'Custom' : metadata?.title) ||
    config.type;
  const minSize = metadata?.minSize ?? { width: 200, height: 150 };
  const frameRef = useRef<HTMLDivElement>(null);

  const handlePointerDown = (e: React.PointerEvent, type: 'drag' | 'resize') => {
    if (!canvasRect) return;
    const cw = canvasRect.width;
    const ch = canvasRect.height;
    if (cw <= 0 || ch <= 0) return;

    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startRect = { ...config.freeform };

    const minWPct = Math.min(100, (minSize.width / cw) * 100);
    const minHPct = Math.min(100, (minSize.height / ch) * 100);

    const handleMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      const dXPct = (dx / cw) * 100;
      const dYPct = (dy / ch) * 100;

      if (type === 'drag') {
        const newX = clamp(startRect.x + dXPct, 0, 100 - startRect.width);
        const newY = clamp(startRect.y + dYPct, 0, 100 - startRect.height);
        onUpdate(config.id, { freeform: { ...startRect, x: newX, y: newY } });
      } else {
        const newW = clamp(startRect.width + dXPct, minWPct, 100 - startRect.x);
        const newH = clamp(startRect.height + dYPct, minHPct, 100 - startRect.y);
        onUpdate(config.id, { freeform: { ...startRect, width: newW, height: newH } });
      }
    };

    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  };

  const { x, y, width, height } = config.freeform;
  const baseAreaPct = 28 * 20;
  const currentAreaPct = width * height;
  const scale = Math.sqrt(currentAreaPct / baseAreaPct);
  const clampedScale = Math.min(2.5, Math.max(0.6, scale));
  const enterOffset = y < 45 ? -20 : 20;
  const enterDelay = ((x + y) % 8) * 35;

  const pxLeft = canvasRect ? (x / 100) * canvasRect.width : 0;
  const pxTop = canvasRect ? (y / 100) * canvasRect.height : 0;
  const pxW = canvasRect ? (width / 100) * canvasRect.width : 0;
  const pxH = canvasRect ? (height / 100) * canvasRect.height : 0;

  const style: React.CSSProperties = {
    position: 'absolute',
    left: pxLeft,
    top: pxTop,
    width: pxW,
    height: pxH,
    zIndex: 10,
  };

  return (
    <div
      ref={frameRef}
      className="widget-frame widget-frame-freeform widget-frame-enter"
      style={{
        ...style,
        ['--widget-scale' as string]: clampedScale,
        ['--enter-offset-y' as string]: `${enterOffset}px`,
        ['--enter-delay' as string]: `${enterDelay}ms`,
      }}
    >
      <div className="widget-header" onPointerDown={(e) => handlePointerDown(e, 'drag')}>
        <span className="widget-title">{title}</span>
        <GripVertical size={14} className="drag-handle" />
      </div>
      <div className="widget-body">
        <Body config={config} />
      </div>
      <div className="resize-handle" onPointerDown={(e) => handlePointerDown(e, 'resize')}>
        <div className="resize-icon" />
      </div>
    </div>
  );
};
