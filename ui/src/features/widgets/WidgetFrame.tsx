import React from 'react';
import type { WidgetConfig } from './types';
import { getWidgetMetadata, UnknownWidget } from './registry';
import './widget-frame.css';

interface Props {
  config: WidgetConfig;
  canvasRect: DOMRect | null;
}
export const WidgetFrame: React.FC<Props> = ({ config, canvasRect }) => {
  const metadata = getWidgetMetadata(config.type);
  const Body = metadata?.Component ?? UnknownWidget;

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
      className="widget-frame widget-frame-freeform widget-frame-enter"
      style={{
        ...style,
        ['--widget-scale' as string]: clampedScale,
        ['--enter-offset-y' as string]: `${enterOffset}px`,
        ['--enter-delay' as string]: `${enterDelay}ms`,
      }}
    >
      <div className="widget-body">
        <Body config={config} />
      </div>
    </div>
  );
};
