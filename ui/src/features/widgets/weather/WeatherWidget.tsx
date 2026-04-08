import React from 'react';
import { motion } from 'motion/react';
import { Droplets, Wind } from 'lucide-react';
import type { WidgetConfig } from '../types';
import { WeatherIcon } from './WeatherIcons';
import type { WeatherCondition } from './WeatherIcons';
import './weather-widget.css';

const MOCK_FORECAST = [
  { day: 'Tue', high: 21, low: 14, condition: 'partly-cloudy' as WeatherCondition },
  { day: 'Wed', high: 18, low: 12, condition: 'rain' as WeatherCondition },
  { day: 'Thu', high: 22, low: 15, condition: 'sunny' as WeatherCondition },
];

const stagger = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
};

export const WeatherWidget: React.FC<{ config: WidgetConfig }> = React.memo(({ config }) => {
  const isLarge = config.freeform.width > 28 && config.freeform.height > 20;

  return (
    <div className="widget-content weather-widget">
      <motion.div className="weather-main" {...stagger} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
        <WeatherIcon condition="partly-cloudy" size={isLarge ? 56 : 40} />
        <div className="weather-temp-group">
          <span className="weather-temp">19°</span>
          <span className="weather-feels">Feels 17°</span>
        </div>
      </motion.div>

      <motion.div
        className="weather-condition"
        {...stagger}
        transition={{ delay: 0.1, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        Partly Cloudy
      </motion.div>

      <motion.div
        className="weather-details"
        {...stagger}
        transition={{ delay: 0.2, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <span className="weather-detail-item">
          <Droplets size="1em" /> 62%
        </span>
        <span className="weather-detail-item">
          <Wind size="1em" /> 12 km/h
        </span>
      </motion.div>

      {isLarge && (
        <motion.div
          className="weather-forecast"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35, duration: 0.6 }}
        >
          {MOCK_FORECAST.map((f, i) => (
            <motion.div
              key={f.day}
              className="forecast-card"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 + i * 0.08, type: 'spring', stiffness: 300, damping: 28 }}
            >
              <span className="forecast-day">{f.day}</span>
              <WeatherIcon condition={f.condition} size={22} />
              <span className="forecast-temps">
                <span className="forecast-high">{f.high}°</span>
                <span className="forecast-low">{f.low}°</span>
              </span>
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
});

WeatherWidget.displayName = 'WeatherWidget';
