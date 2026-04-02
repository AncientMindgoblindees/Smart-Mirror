import React, { useRef } from 'react';
import { WidgetConfig, LayoutMode } from '../types';
import { getWidgetMetadata, UnknownWidget } from '../registry';
import { GripVertical } from 'lucide-react';

interface Props {
  config: WidgetConfig;
  layoutMode: LayoutMode;
  onUpdate: (id: string, updates: Partial<WidgetConfig>) => void;
  canvasRect: DOMRect | null;
}

export const WidgetFrame: React.FC<Props> = ({ config, layoutMode, onUpdate, canvasRect }) => {
  const metadata = getWidgetMetadata(config.type);
  const Body = metadata?.Component ?? UnknownWidget;
  const title = metadata?.title ?? config.type;
  const minSize = metadata?.minSize ?? { width: 200, height: 150 };
  const isFreeform = layoutMode === 'freeform';
  const frameRef = useRef<HTMLDivElement>(null);

  const handlePointerDown = (e: React.PointerEvent, type: 'drag' | 'resize') => {
    if (!isFreeform || !canvasRect) return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startRect = { ...config.freeform };

    const handleMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;

      if (type === 'drag') {
        const newX = Math.max(0, Math.min(canvasRect.width - startRect.width, startRect.x + dx));
        const newY = Math.max(0, Math.min(canvasRect.height - startRect.height, startRect.y + dy));
        onUpdate(config.id, { freeform: { ...startRect, x: newX, y: newY } });
      } else {
        const newW = Math.max(minSize.width, Math.min(canvasRect.width - startRect.x, startRect.width + dx));
        const newH = Math.max(minSize.height, Math.min(canvasRect.height - startRect.y, startRect.height + dy));
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

  const width = isFreeform ? config.freeform.width : config.grid.colSpan * 250;
  const height = isFreeform ? config.freeform.height : config.grid.rowSpan * 200;
  const baseArea = 300 * 200;
  const currentArea = width * height;
  const scale = Math.sqrt(currentArea / baseArea);
  const clampedScale = Math.min(2.5, Math.max(0.6, scale));

  const style: React.CSSProperties = isFreeform
    ? {
        position: 'absolute',
        left: config.freeform.x,
        top: config.freeform.y,
        width: config.freeform.width,
        height: config.freeform.height,
        zIndex: 10,
      }
    : {
        gridRow: `${config.grid.row} / span ${config.grid.rowSpan}`,
        gridColumn: `${config.grid.col} / span ${config.grid.colSpan}`,
      };

  return (
    <div
      ref={frameRef}
      className={`widget-frame mode-${layoutMode}`}
      style={{ ...style, ['--widget-scale' as string]: clampedScale }}
    >
      <div className="widget-header" onPointerDown={(e) => handlePointerDown(e, 'drag')}>
        <span className="widget-title">{title}</span>
        {isFreeform && <GripVertical size={14} className="drag-handle" />}
      </div>
      <div className="widget-body">
        <Body config={config} layoutMode={layoutMode} />
      </div>
      {isFreeform && (
        <div className="resize-handle" onPointerDown={(e) => handlePointerDown(e, 'resize')}>
          <div className="resize-icon" />
        </div>
      )}
    </div>
  );
};
