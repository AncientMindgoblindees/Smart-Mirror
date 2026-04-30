import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Droplets, Wind, Thermometer, MapPin } from 'lucide-react';
import type { WidgetConfig } from '../types';
import { inferWidgetSizePreset } from '../sizePresets';
import { WeatherIcon } from './WeatherIcons';
import { getWeather } from '@/api/mirrorApi';
import type { WeatherSnapshotOut } from '@/api/backendTypes';
import { asWeatherCondition, tempSuffix } from '@/api/transforms/weather';
import './weather-widget.css';

const POLL_MS = 5 * 60 * 1000;
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_PREFIX = 'mirror_weather_cache_v1:';

type CachedWeather = {
  at: number;
  snapshot: WeatherSnapshotOut;
};

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

function cacheKey(location: string | undefined, unit: 'metric' | 'imperial'): string {
  const q = (location || '').trim().toLowerCase() || 'auto';
  return `${CACHE_PREFIX}${unit}:${q}`;
}

function readWeatherCache(key: string): CachedWeather | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedWeather;
    if (!parsed || typeof parsed.at !== 'number' || !parsed.snapshot) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeWeatherCache(key: string, snapshot: WeatherSnapshotOut): void {
  try {
    const payload: CachedWeather = { at: Date.now(), snapshot };
    localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // ignore localStorage write failures
  }
}

export const WeatherWidget: React.FC<{ config: WidgetConfig }> = React.memo(({ config }) => {
  const preset = config.freeform.sizePreset ?? inferWidgetSizePreset(config.freeform.width, config.freeform.height);
  const isLarge = preset === 'large' && config.freeform.height >= 26;
  const isSmall = preset === 'small';

  const [snap, setSnap] = useState<WeatherSnapshotOut | null>(null);
  const effectiveUnit = config.unit === 'imperial' ? 'imperial' : 'metric';
  const weatherKey = useMemo(
    () => cacheKey(config.location?.trim() || undefined, effectiveUnit),
    [config.location, effectiveUnit],
  );

  const load = useCallback(
    async (opts?: { showLoading?: boolean; force?: boolean }) => {
      if (opts?.showLoading) setSnap(null);
      const cached = readWeatherCache(weatherKey);
      const isFresh = Boolean(cached && Date.now() - cached.at < CACHE_TTL_MS);
      if (!opts?.force && isFresh && cached) {
        setSnap(cached.snapshot);
        return;
      }
      try {
        const w = await getWeather({
          q: config.location?.trim() || undefined,
          units: effectiveUnit,
        });
        setSnap(w);
        writeWeatherCache(weatherKey, w);
      } catch {
        if (cached) {
          setSnap(cached.snapshot);
          return;
        }
        setSnap(fetchErrorSnapshot('Could not reach the weather service.'));
      }
    },
    [config.location, effectiveUnit, weatherKey]
  );

  useEffect(() => {
    void load({ showLoading: true });
    const id = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  const forecast = useMemo(() => (snap?.forecast ?? []).slice(0, 7), [snap?.forecast]);

  const iconSize = isLarge ? 72 : isSmall ? 42 : 52;

  if (snap === null) {
    return (
      <div
        className={`widget-content weather-widget-v2 weather-widget-state ${
          isLarge ? 'weather-large' : isSmall ? 'weather-small' : 'weather-medium'
        }`}
      >
        <p className="weather-widget-state-msg">Loading weather...</p>
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
        <button type="button" className="weather-widget-retry" onClick={() => void load({ showLoading: true, force: true })}>
          Retry
        </button>
      </div>
    );
  }

  const mainCondition = asWeatherCondition(snap.condition);
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
          <div className="forecast-grid-7" aria-label="7 day forecast">
            {forecast.map((f, i) => (
              <motion.div
                key={`${f.weekday}-${i}`}
                className="forecast-day-card"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.48 + i * 0.06, type: 'spring', stiffness: 200, damping: 24 }}
              >
                <span className="forecast-day">{f.weekday}</span>
                <WeatherIcon condition={asWeatherCondition(f.condition)} size={22} />
                <div className="forecast-temps">
                  <span className="high">{Math.round(f.high)}{deg}</span>
                  <span className="low">{Math.round(f.low)}{deg}</span>
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

