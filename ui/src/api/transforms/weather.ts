import type { WeatherCondition } from '@/features/widgets/weather/WeatherIcons';

export function asWeatherCondition(s: string): WeatherCondition {
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

export function tempSuffix(unit: 'celsius' | 'fahrenheit'): string {
  return unit === 'fahrenheit' ? '°F' : '°C';
}
