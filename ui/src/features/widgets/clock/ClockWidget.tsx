import React, { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { WidgetConfig } from '../types';
import './clock-widget.css';

const digitTransition = {
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -18 },
  transition: { type: 'spring' as const, stiffness: 300, damping: 30 },
};

function AnimatedDigit({ value, className }: { value: string; className?: string }) {
  return (
    <span className={`digit-slot ${className ?? ''}`}>
      <AnimatePresence mode="popLayout">
        <motion.span
          key={value}
          className="digit-value"
          {...digitTransition}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

type ClockFormat = '12h' | '24h';

export function getClockDisplayParts(time: Date, format: ClockFormat = '24h') {
  const is12Hour = format === '12h';
  const rawHours = time.getHours();
  const hours = is12Hour
    ? String(rawHours % 12 || 12).padStart(2, '0')
    : String(rawHours).padStart(2, '0');
  const minutes = String(time.getMinutes()).padStart(2, '0');
  const seconds = String(time.getSeconds()).padStart(2, '0');
  const meridiem = is12Hour ? (rawHours >= 12 ? 'PM' : 'AM') : '';
  return { hours, minutes, seconds, meridiem, is12Hour };
}

export const ClockWidget: React.FC<{ config: WidgetConfig }> = React.memo(({ config }) => {
  const [time, setTime] = useState(new Date());
  const rafRef = useRef<number>(0);

  useEffect(() => {
    let lastSec = -1;
    const tick = () => {
      const now = new Date();
      if (now.getSeconds() !== lastSec) {
        lastSec = now.getSeconds();
        setTime(now);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const format: ClockFormat = config.format === '12h' ? '12h' : '24h';
  const { hours, minutes, seconds, meridiem, is12Hour } = getClockDisplayParts(time, format);

  const dateStr = time.toLocaleDateString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="widget-content clock-widget">
      <div className="clock-time" aria-label={time.toLocaleTimeString([], { hour12: is12Hour })}>
        <div className="clock-hhmm">
          <AnimatedDigit value={hours[0]} />
          <AnimatedDigit value={hours[1]} />
          <span className="clock-colon">:</span>
          <AnimatedDigit value={minutes[0]} />
          <AnimatedDigit value={minutes[1]} />
          {is12Hour ? <span className="clock-meridiem">{meridiem}</span> : null}
        </div>
        <div className="clock-seconds">
          <AnimatedDigit value={seconds[0]} className="sec" />
          <AnimatedDigit value={seconds[1]} className="sec" />
        </div>
      </div>
      <motion.div
        className="clock-date"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      >
        {dateStr}
      </motion.div>
    </div>
  );
});

ClockWidget.displayName = 'ClockWidget';
