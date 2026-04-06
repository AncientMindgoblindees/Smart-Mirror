import React, { useState, useEffect } from 'react';
import type { WidgetConfig } from '../types';
import './clock-widget.css';

export const ClockWidget: React.FC<{ config: WidgetConfig }> = () => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const hhmm = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  const ss = time.toLocaleTimeString([], { second: '2-digit', hour12: false });

  return (
    <div className="widget-content clock-widget">
      <div className="time" aria-label={time.toLocaleTimeString()}>
        <span className="hhmm">{hhmm}</span>
        <span className="seconds">{ss}</span>
      </div>
      <div className="date">
        {time.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
      </div>
    </div>
  );
};
