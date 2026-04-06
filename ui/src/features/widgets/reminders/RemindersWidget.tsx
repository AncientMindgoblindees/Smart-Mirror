import React from 'react';
import type { WidgetConfig } from '../types';
import './reminders-widget.css';

export const RemindersWidget: React.FC<{ config: WidgetConfig }> = () => (
  <div className="widget-content reminders-widget">
    <p className="reminders-placeholder">Reminders</p>
    <p className="reminders-hint">Configure on the mirror config app.</p>
  </div>
);
