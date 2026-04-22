import React, { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useReducedMotion } from '@/hooks/useReducedMotion';
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

function StaticDigit({ value, className }: { value: string; className?: string }) {
  return (
    <span className={`digit-slot ${className ?? ''}`}>
      <span className="digit-value">{value}</span>
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
  const timeoutRef = useRef<number>(0);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setTime(now);
      timeoutRef.current = window.setTimeout(tick, Math.max(50, 1000 - now.getMilliseconds()));
    };
    tick();
    return () => window.clearTimeout(timeoutRef.current);
  }, []);

  const format: ClockFormat = config.format === '12h' ? '12h' : '24h';
  const { hours, minutes, seconds, meridiem, is12Hour } = getClockDisplayParts(time, format);
  const Digit = reducedMotion ? StaticDigit : AnimatedDigit;

  const dateStr = time.toLocaleDateString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="widget-content clock-widget">
      <div className="clock-time" aria-label={time.toLocaleTimeString([], { hour12: is12Hour })}>
        <div className="clock-hhmm">
          <Digit value={hours[0]} />
          <Digit value={hours[1]} />
          <span className="clock-colon">:</span>
          <Digit value={minutes[0]} />
          <Digit value={minutes[1]} />
          {is12Hour ? <span className="clock-meridiem">{meridiem}</span> : null}
        </div>
        <div className="clock-seconds">
          <Digit value={seconds[0]} className="sec" />
          <Digit value={seconds[1]} className="sec" />
        </div>
      </div>
      {reducedMotion ? (
        <div className="clock-date">{dateStr}</div>
      ) : (
        <motion.div
          className="clock-date"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          {dateStr}
        </motion.div>
      )}
    </div>
  );
});

ClockWidget.displayName = 'ClockWidget';
