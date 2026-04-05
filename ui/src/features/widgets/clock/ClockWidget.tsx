import React, { useState, useEffect } from 'react';
import type { WidgetConfig } from '../types';
import './clock-widget.css';

export const ClockWidget: React.FC<{ config: WidgetConfig }> = () => {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="widget-content clock-widget">
      <div className="time">
        {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
      </div>
      <div className="date">
        {time.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
      </div>
    </div>
  );
};
