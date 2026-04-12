import React from 'react';
import { motion } from 'motion/react';
import type { WidgetConfig } from './types';
import { getWidgetMetadata, UnknownWidget } from './registry';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/Tooltip';
import { inferWidgetSizePreset } from './sizePresets';
import './widget-frame.css';

interface Props {
  config: WidgetConfig;
  canvasRect: DOMRect | null;
}

export const WidgetFrame: React.FC<Props> = React.memo(({ config, canvasRect }) => {
  const metadata = getWidgetMetadata(config.type);
  const Body = metadata?.Component ?? UnknownWidget;

  const { x, y, width, height } = config.freeform;
  const sizePreset = config.freeform.sizePreset ?? inferWidgetSizePreset(width, height);
  const baseAreaPct = 28 * 20;
  const currentAreaPct = width * height;
  const scale = Math.sqrt(currentAreaPct / baseAreaPct);
  const clampedScale = Math.min(2.5, Math.max(0.6, scale));
  const enterFromTop = y < 45;
  const staggerDelay = ((x + y) % 8) * 0.04;

  const pxLeft = canvasRect ? (x / 100) * canvasRect.width : 0;
  const pxTop = canvasRect ? (y / 100) * canvasRect.height : 0;
  const pxW = canvasRect ? (width / 100) * canvasRect.width : 0;
  const pxH = canvasRect ? (height / 100) * canvasRect.height : 0;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <motion.div
          className={`widget-frame widget-frame-freeform widget-size-${sizePreset}`}
          data-size={sizePreset}
          style={{
            position: 'absolute',
            left: pxLeft,
            top: pxTop,
            width: pxW,
            height: pxH,
            zIndex: 10,
            ['--widget-scale' as string]: clampedScale,
          }}
          initial={{
            opacity: 0,
            y: enterFromTop ? -24 : 24,
            scale: 0.96,
          }}
          animate={{
            opacity: 1,
            y: 0,
            scale: 1,
          }}
          exit={{
            opacity: 0,
            scale: 0.95,
            transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] },
          }}
          transition={{
            type: 'spring',
            stiffness: 260,
            damping: 28,
            delay: staggerDelay,
          }}
          whileHover={{
            scale: 1.018,
            transition: { type: 'spring', stiffness: 400, damping: 25 },
          }}
          whileTap={{ scale: 0.98 }}
        >
          <div className="widget-glass-highlight" aria-hidden="true" />
          <div className="widget-body">
            <Body config={config} />
          </div>
        </motion.div>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="center">
        {metadata?.title || 'Smart Widget'}
      </TooltipContent>
    </Tooltip>
  );
});

WidgetFrame.displayName = 'WidgetFrame';
