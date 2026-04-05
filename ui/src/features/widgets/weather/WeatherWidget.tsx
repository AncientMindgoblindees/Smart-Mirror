import React from 'react';
import { Cloud } from 'lucide-react';
import type { WidgetConfig } from '../types';
import './weather-widget.css';

export const WeatherWidget: React.FC<{ config: WidgetConfig }> = () => (
  <div className="widget-content weather-widget">
    <div className="weather-main">
      <Cloud size="2em" color="var(--color-accent)" />
      <span className="temp">19°</span>
    </div>
    <div className="weather-label">Partly Cloudy • London</div>
  </div>
);
