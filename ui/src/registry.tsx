import React, { useState, useEffect } from 'react';
import { Cloud } from 'lucide-react';
import { WidgetMetadata, WidgetConfig, LayoutMode } from './types';

const ClockWidget: WidgetMetadata['Component'] = () => {
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

const WeatherWidget: WidgetMetadata['Component'] = () => (
  <div className="widget-content weather-widget">
    <div className="weather-main">
      <Cloud size="2em" color="var(--color-accent)" />
      <span className="temp">19°</span>
    </div>
    <div className="weather-label">Partly Cloudy • London</div>
  </div>
);

const CalendarWidget: WidgetMetadata['Component'] = () => (
  <div className="widget-content calendar-widget">
    <div className="calendar-item">
      <span className="time">09:00</span>
      <span className="event">Morning Standup</span>
    </div>
    <div className="calendar-item">
      <span className="time">13:00</span>
      <span className="event">Product Review</span>
    </div>
    <div className="calendar-item">
      <span className="time">19:00</span>
      <span className="event">Gym Session</span>
    </div>
  </div>
);

export const WIDGET_REGISTRY: Record<string, WidgetMetadata> = {
  clock: {
    title: 'Clock',
    defaultGrid: { rowSpan: 1, colSpan: 2 },
    minSize: { width: 300, height: 150 },
    Component: ClockWidget,
  },
  weather: {
    title: 'Weather',
    defaultGrid: { rowSpan: 1, colSpan: 1 },
    minSize: { width: 200, height: 150 },
    Component: WeatherWidget,
  },
  calendar: {
    title: 'Calendar',
    defaultGrid: { rowSpan: 2, colSpan: 1 },
    minSize: { width: 250, height: 300 },
    Component: CalendarWidget,
  },
};

export function getWidgetMetadata(type: string): WidgetMetadata | undefined {
  return WIDGET_REGISTRY[type];
}

/**
 * To add a widget: register it in WIDGET_REGISTRY; no changes required to App layout logic.
 */
export const UnknownWidget: WidgetMetadata['Component'] = ({
  config,
}: {
  config: WidgetConfig;
  layoutMode: LayoutMode;
}) => (
  <div className="widget-content">
    <p style={{ color: 'var(--color-text-secondary)' }}>Unknown widget type: {config.type}</p>
  </div>
);
