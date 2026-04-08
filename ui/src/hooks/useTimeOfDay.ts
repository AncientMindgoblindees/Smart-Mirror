import { useState, useEffect } from 'react';

export type TimePeriod = 'night' | 'dawn' | 'morning' | 'afternoon' | 'dusk' | 'evening';

interface AmbientConfig {
  hue: number;
  saturation: number;
  lightness: number;
  glowIntensity: number;
}

const PERIOD_CONFIG: Record<TimePeriod, AmbientConfig> = {
  night:     { hue: 230, saturation: 20, lightness: 4,  glowIntensity: 0.06 },
  dawn:      { hue: 30,  saturation: 50, lightness: 10, glowIntensity: 0.14 },
  morning:   { hue: 45,  saturation: 40, lightness: 12, glowIntensity: 0.16 },
  afternoon: { hue: 200, saturation: 30, lightness: 10, glowIntensity: 0.12 },
  dusk:      { hue: 15,  saturation: 55, lightness: 10, glowIntensity: 0.18 },
  evening:   { hue: 260, saturation: 25, lightness: 6,  glowIntensity: 0.08 },
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
