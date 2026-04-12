import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Droplets, Wind, Thermometer, MapPin } from 'lucide-react';
import type { WidgetConfig } from '../types';
import { inferWidgetSizePreset } from '../sizePresets';
import { WeatherIcon } from './WeatherIcons';
import type { WeatherCondition } from './WeatherIcons';
import { getWeather } from '@/api/mirrorApi';
import type { WeatherSnapshotOut } from '@/api/backendTypes';
import './weather-widget.css';

const POLL_MS = 5 * 60 * 1000;

function asCondition(s: string): WeatherCondition {
  const allowed: WeatherCondition[] = [
    'sunny',
    'partly-cloudy',
    'cloudy',
    'rain',
    'thunderstorm',
    'snow',
    'fog',
    'wind',
  ];
  return (allowed.includes(s as WeatherCondition) ? s : 'partly-cloudy') as WeatherCondition;
}

function tempBarStyle(
  low: number,
  high: number,
  globalMin: number,
  globalMax: number
): { marginLeft: string; width: string } {
  const span = Math.max(1e-6, globalMax - globalMin);
  const leftPct = ((low - globalMin) / span) * 100;
  const widthPct = Math.max(2, ((high - low) / span) * 100);
  return {
    marginLeft: `${Math.min(100, Math.max(0, leftPct))}%`,
    width: `${Math.min(100, widthPct)}%`,
  };
}

const stagger = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
};

function fetchErrorSnapshot(message: string): WeatherSnapshotOut {
  return {
    configured: true,
    live: false,
    location: '',
    temperature_unit: 'celsius',
    wind_unit: 'kmh',
    condition_text: '',
    condition: 'partly-cloudy',
    forecast: [],
    error: message,
  };
}

function tempSuffix(unit: WeatherSnapshotOut['temperature_unit']): string {
  return unit === 'fahrenheit' ? '°F' : '°C';
}

export const WeatherWidget: React.FC<{ config: WidgetConfig }> = React.memo(({ config }) => {
  const preset = config.freeform.sizePreset ?? inferWidgetSizePreset(config.freeform.width, config.freeform.height);
  const isLarge = preset === 'large' && config.freeform.height >= 26;
  const isSmall = preset === 'small';

  const [snap, setSnap] = useState<WeatherSnapshotOut | null>(null);

  const load = useCallback(
    async (opts?: { showLoading?: boolean }) => {
      if (opts?.showLoading) setSnap(null);
      try {
        const w = await getWeather({
          q: config.location?.trim() || undefined,
          units: config.unit === 'imperial' ? 'imperial' : 'metric',
        });
        setSnap(w);
      } catch {
        setSnap(fetchErrorSnapshot('Could not reach the weather service.'));
      }
    },
    [config.location, config.unit]
  );

  useEffect(() => {
    void load({ showLoading: true });
    const id = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  const forecast = snap?.forecast ?? [];
  const globalMin = useMemo(
    () => (forecast.length ? Math.min(...forecast.map((f) => f.low)) : 0),
    [forecast]
  );
  const globalMax = useMemo(
    () => (forecast.length ? Math.max(...forecast.map((f) => f.high)) : 1),
    [forecast]
  );

  const iconSize = isLarge ? 72 : isSmall ? 42 : 52;

  if (snap === null) {
    return (
      <div
        className={`widget-content weather-widget-v2 weather-widget-state ${
          isLarge ? 'weather-large' : isSmall ? 'weather-small' : 'weather-medium'
        }`}
      >
        <p className="weather-widget-state-msg">Loading weather…</p>
      </div>
    );
  }

  if (!snap.configured) {
    return (
      <div
        className={`widget-content weather-widget-v2 weather-widget-state ${
          isLarge ? 'weather-large' : isSmall ? 'weather-small' : 'weather-medium'
        }`}
      >
        <p className="weather-widget-state-msg">Weather API is not configured.</p>
        <p className="weather-widget-state-hint">
          Set <code className="weather-widget-code">WEATHERAPI_KEY</code> in the server{' '}
          <code className="weather-widget-code">.env</code> and restart the backend.
        </p>
      </div>
    );
  }

  if (!snap.live) {
    const detail = snap.error?.trim() || 'Weather data is unavailable.';
    return (
      <div
        className={`widget-content weather-widget-v2 weather-widget-state ${
          isLarge ? 'weather-large' : isSmall ? 'weather-small' : 'weather-medium'
        }`}
      >
        <p className="weather-widget-state-msg">{detail}</p>
        <button type="button" className="weather-widget-retry" onClick={() => void load({ showLoading: true })}>
          Retry
        </button>
      </div>
    );
  }

  const mainCondition = asCondition(snap.condition);
  const deg = tempSuffix(snap.temperature_unit);

  return (
    <div
      className={`widget-content weather-widget-v2 ${
        isLarge ? 'weather-large' : isSmall ? 'weather-small' : 'weather-medium'
      }`}
    >
      <header className="weather-header">
        <div className="location-badge">
          <MapPin size={12} className="text-[var(--color-accent)]" />
          <span>{snap.location}</span>
        </div>
      </header>

      <div className="weather-main-section">
        <motion.div
          className="weather-visual"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          <WeatherIcon condition={mainCondition} size={iconSize} />
          <div className="weather-temp-display">
            <span className="current-temp">
              {Math.round(snap.temp ?? 0)}
              <span className="unit">{deg}</span>
            </span>
            <span className="condition-label">{snap.condition_text}</span>
          </div>
        </motion.div>

        <motion.div
          className="weather-stats-grid"
          {...stagger}
          transition={{ delay: 0.2, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="stat-item">
            <Thermometer size={14} className="stat-icon text-[var(--color-warm)]" />
            <div className="stat-info">
              <span className="stat-label">Feels</span>
              <span className="stat-value">
                {Math.round(snap.feels_like ?? 0)}
                {deg}
              </span>
            </div>
          </div>
          <div className="stat-item">
            <Droplets size={14} className="stat-icon text-[var(--color-cool)]" />
            <div className="stat-info">
              <span className="stat-label">Humidity</span>
              <span className="stat-value">{snap.humidity_pct ?? 0}%</span>
            </div>
          </div>
          <div className="stat-item">
            <Wind size={14} className="stat-icon text-[var(--color-accent)]" />
            <div className="stat-info">
              <span className="stat-label">Wind</span>
              <span className="stat-value">
                {Math.round(snap.wind_speed ?? 0)} {snap.wind_unit === 'mph' ? 'mph' : 'km/h'}
              </span>
            </div>
          </div>
        </motion.div>
      </div>

      {isLarge && forecast.length > 0 && (
        <motion.div
          className="weather-forecast-v2"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.7 }}
        >
          <div className="forecast-divider" />
          <div className="forecast-list">
            {forecast.map((f, i) => (
              <motion.div
                key={`${f.weekday}-${i}`}
                className="forecast-item-v2"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 + i * 0.1, type: 'spring', stiffness: 200, damping: 25 }}
              >
                <span className="forecast-day">{f.weekday}</span>
                <WeatherIcon condition={asCondition(f.condition)} size={24} />
                <div className="forecast-range">
                  <span className="high">
                    {Math.round(f.high)}
                    {deg}
                  </span>
                  <div className="temp-bar-bg">
                    <div
                      className="temp-bar-fill"
                      style={tempBarStyle(f.low, f.high, globalMin, globalMax)}
                    />
                  </div>
                  <span className="low">
                    {Math.round(f.low)}
                    {deg}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
});

WeatherWidget.displayName = 'WeatherWidget';
