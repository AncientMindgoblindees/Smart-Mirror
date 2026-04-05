import React from 'react';
import type { WidgetConfig } from '../types';
import './calendar-widget.css';

export const CalendarWidget: React.FC<{ config: WidgetConfig }> = () => (
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
