import { useState, useEffect } from 'react';

export type TimePeriod = 'night' | 'dawn' | 'morning' | 'afternoon' | 'dusk' | 'evening';

interface AmbientConfig {
  hue: number;
  saturation: number;
  lightness: number;
  glowIntensity: number;
}

const PERIOD_CONFIG: Record<TimePeriod, AmbientConfig> = {
  night:     { hue: 240, saturation: 25, lightness: 3,  glowIntensity: 0.08 },
  dawn:      { hue: 320, saturation: 40, lightness: 8,  glowIntensity: 0.15 },
  morning:   { hue: 190, saturation: 35, lightness: 10, glowIntensity: 0.12 },
  afternoon: { hue: 210, saturation: 30, lightness: 10, glowIntensity: 0.10 },
  dusk:      { hue: 20,  saturation: 50, lightness: 8,  glowIntensity: 0.20 },
  evening:   { hue: 270, saturation: 30, lightness: 5,  glowIntensity: 0.12 },
};

function getPeriod(hour: number): TimePeriod {
  if (hour >= 5 && hour < 7) return 'dawn';
  if (hour >= 7 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 20) return 'dusk';
  if (hour >= 20 && hour < 23) return 'evening';
  return 'night';
}

function applyAmbientVars(config: AmbientConfig) {
  const root = document.documentElement;
  root.style.setProperty('--ambient-hue', String(config.hue));
  root.style.setProperty('--ambient-saturation', `${config.saturation}%`);
  root.style.setProperty('--ambient-lightness', `${config.lightness}%`);
  root.style.setProperty('--ambient-glow-intensity', String(config.glowIntensity));
}

export function useTimeOfDay(): TimePeriod {
  const [period, setPeriod] = useState<TimePeriod>(() => getPeriod(new Date().getHours()));

  useEffect(() => {
    const update = () => {
      const next = getPeriod(new Date().getHours());
      setPeriod(next);
      applyAmbientVars(PERIOD_CONFIG[next]);
    };
    update();
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, []);

  return period;
}
