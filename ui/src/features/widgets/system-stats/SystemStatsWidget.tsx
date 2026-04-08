import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import type { WidgetConfig } from '../types';
import './system-stats-widget.css';

interface StatGauge {
  label: string;
  value: number;
  unit: string;
  color: string;
  maxValue: number;
}

function getGaugeColor(value: number, max: number): string {
  const ratio = value / max;
  if (ratio < 0.5) return 'var(--color-success)';
  if (ratio < 0.8) return 'var(--color-warm)';
  return 'var(--color-danger)';
}

function CircularGauge({ label, value, unit, color, maxValue }: StatGauge) {
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(value / maxValue, 1);
  const dashOffset = circumference * (1 - progress);

  return (
    <div className="stat-gauge">
      <svg width="72" height="72" viewBox="0 0 72 72" className="gauge-ring">
        <circle
          cx="36" cy="36" r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="4"
        />
        <motion.circle
          cx="36" cy="36" r={radius}
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: dashOffset }}
          transition={{ type: 'spring', stiffness: 80, damping: 20 }}
          transform="rotate(-90 36 36)"
          style={{ filter: `drop-shadow(0 0 4px ${color})` }}
        />
      </svg>
      <div className="gauge-label-group">
        <span className="gauge-value" style={{ color }}>{Math.round(value)}</span>
        <span className="gauge-unit">{unit}</span>
      </div>
      <span className="gauge-label">{label}</span>
    </div>
  );
}

function mockSystemStats() {
  return {
    cpu: 15 + Math.random() * 40,
    memory: 40 + Math.random() * 30,
    temp: 38 + Math.random() * 20,
  };
}

export const SystemStatsWidget: React.FC<{ config: WidgetConfig }> = React.memo(() => {
  const [stats, setStats] = useState(mockSystemStats);

  useEffect(() => {
    const id = setInterval(() => setStats(mockSystemStats()), 5000);
    return () => clearInterval(id);
  }, []);

  const gauges: StatGauge[] = [
    { label: 'CPU', value: stats.cpu, unit: '%', maxValue: 100, color: getGaugeColor(stats.cpu, 100) },
    { label: 'RAM', value: stats.memory, unit: '%', maxValue: 100, color: getGaugeColor(stats.memory, 100) },
    { label: 'Temp', value: stats.temp, unit: '°C', maxValue: 85, color: getGaugeColor(stats.temp, 85) },
  ];

  return (
    <div className="widget-content system-stats-widget">
      <div className="stats-row">
        {gauges.map((g, i) => (
          <motion.div
            key={g.label}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.1, type: 'spring', stiffness: 300, damping: 28 }}
          >
            <CircularGauge {...g} />
          </motion.div>
        ))}
      </div>
    </div>
  );
});

SystemStatsWidget.displayName = 'SystemStatsWidget';
