import React from 'react';
import './weather-icons.css';

export type WeatherCondition =
  | 'sunny'
  | 'partly-cloudy'
  | 'cloudy'
  | 'rain'
  | 'thunderstorm'
  | 'snow'
  | 'fog'
  | 'wind';

interface IconProps {
  size?: number;
  className?: string;
}

export const SunIcon: React.FC<IconProps> = ({ size = 48, className }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" className={`weather-icon wi-sun ${className ?? ''}`}>
    <circle cx="24" cy="24" r="9" fill="none" stroke="var(--color-warm)" strokeWidth="2" className="sun-core" />
    {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
      <line
        key={angle}
        x1="24" y1="6" x2="24" y2="10"
        stroke="var(--color-warm)"
        strokeWidth="2"
        strokeLinecap="round"
        transform={`rotate(${angle} 24 24)`}
        className="sun-ray"
      />
    ))}
  </svg>
);

export const CloudIcon: React.FC<IconProps> = ({ size = 48, className }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" className={`weather-icon wi-cloud ${className ?? ''}`}>
    <path
      d="M14 32a7 7 0 0 1-1-13.9A10 10 0 0 1 32.6 16 8 8 0 0 1 36 32H14z"
      fill="none"
      stroke="var(--color-text-secondary)"
      strokeWidth="2"
      strokeLinejoin="round"
      className="cloud-body"
    />
  </svg>
);

export const RainIcon: React.FC<IconProps> = ({ size = 48, className }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" className={`weather-icon wi-rain ${className ?? ''}`}>
    <path
      d="M14 28a6 6 0 0 1-1-11.9A9 9 0 0 1 31 14a7 7 0 0 1 3 14H14z"
      fill="none"
      stroke="var(--color-cool)"
      strokeWidth="2"
      strokeLinejoin="round"
      opacity="0.6"
    />
    {[18, 24, 30].map((x, i) => (
      <line
        key={x}
        x1={x} y1="32" x2={x - 1} y2="38"
        stroke="var(--color-cool)"
        strokeWidth="2"
        strokeLinecap="round"
        className="rain-drop"
        style={{ animationDelay: `${i * 0.25}s` }}
      />
    ))}
  </svg>
);

export const SnowIcon: React.FC<IconProps> = ({ size = 48, className }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" className={`weather-icon wi-snow ${className ?? ''}`}>
    <path
      d="M14 28a6 6 0 0 1-1-11.9A9 9 0 0 1 31 14a7 7 0 0 1 3 14H14z"
      fill="none"
      stroke="var(--color-text-secondary)"
      strokeWidth="2"
      strokeLinejoin="round"
      opacity="0.5"
    />
    {[17, 24, 31].map((x, i) => (
      <circle
        key={x}
        cx={x} cy="35" r="2"
        fill="rgba(255,255,255,0.7)"
        className="snow-flake"
        style={{ animationDelay: `${i * 0.4}s` }}
      />
    ))}
  </svg>
);

export const ThunderstormIcon: React.FC<IconProps> = ({ size = 48, className }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" className={`weather-icon wi-storm ${className ?? ''}`}>
    <path
      d="M14 26a6 6 0 0 1-1-11.9A9 9 0 0 1 31 12a7 7 0 0 1 3 14H14z"
      fill="none"
      stroke="var(--color-text-secondary)"
      strokeWidth="2"
      strokeLinejoin="round"
      opacity="0.5"
    />
    <polyline
      points="22,28 18,36 24,36 20,44"
      fill="none"
      stroke="var(--color-warm)"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="lightning-bolt"
    />
  </svg>
);

export const PartlyCloudyIcon: React.FC<IconProps> = ({ size = 48, className }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" className={`weather-icon wi-partly-cloudy ${className ?? ''}`}>
    <circle cx="18" cy="16" r="7" fill="none" stroke="var(--color-warm)" strokeWidth="2" className="sun-core" opacity="0.6" />
    <path
      d="M16 34a6 6 0 0 1-1-11.9A9 9 0 0 1 33 20a7 7 0 0 1 3 14H16z"
      fill="none"
      stroke="var(--color-text-secondary)"
      strokeWidth="2"
      strokeLinejoin="round"
      className="cloud-body"
    />
  </svg>
);

export const FogIcon: React.FC<IconProps> = ({ size = 48, className }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" className={`weather-icon wi-fog ${className ?? ''}`}>
    {[18, 24, 30, 36].map((y, i) => (
      <line
        key={y}
        x1={10 + i * 2} y1={y} x2={38 - i * 2} y2={y}
        stroke="var(--color-text-secondary)"
        strokeWidth="2"
        strokeLinecap="round"
        className="fog-line"
        style={{ animationDelay: `${i * 0.3}s` }}
        opacity={0.6 - i * 0.1}
      />
    ))}
  </svg>
);

export const WindIcon: React.FC<IconProps> = ({ size = 48, className }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" className={`weather-icon wi-wind ${className ?? ''}`}>
    <path d="M8 20h24a4 4 0 1 0-4-4" fill="none" stroke="var(--color-text-secondary)" strokeWidth="2" strokeLinecap="round" className="wind-line" />
    <path d="M8 26h18a3 3 0 1 1-3 3" fill="none" stroke="var(--color-text-secondary)" strokeWidth="2" strokeLinecap="round" className="wind-line" style={{ animationDelay: '0.3s' }} />
    <path d="M8 32h12a3 3 0 1 0-3-3" fill="none" stroke="var(--color-text-secondary)" strokeWidth="2" strokeLinecap="round" className="wind-line" style={{ animationDelay: '0.6s' }} />
  </svg>
);

const ICON_MAP: Record<WeatherCondition, React.FC<IconProps>> = {
  sunny: SunIcon,
  'partly-cloudy': PartlyCloudyIcon,
  cloudy: CloudIcon,
  rain: RainIcon,
  thunderstorm: ThunderstormIcon,
  snow: SnowIcon,
  fog: FogIcon,
  wind: WindIcon,
};

export const WeatherIcon: React.FC<IconProps & { condition: WeatherCondition }> = ({
  condition,
  ...props
}) => {
  const Icon = ICON_MAP[condition] ?? CloudIcon;
  return <Icon {...props} />;
};
