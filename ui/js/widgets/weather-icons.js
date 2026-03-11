const icons = {
  sunny: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
    <circle cx="32" cy="32" r="12"/>
    <line x1="32" y1="6" x2="32" y2="14"/>
    <line x1="32" y1="50" x2="32" y2="58"/>
    <line x1="6" y1="32" x2="14" y2="32"/>
    <line x1="50" y1="32" x2="58" y2="32"/>
    <line x1="13.6" y1="13.6" x2="19.3" y2="19.3"/>
    <line x1="44.7" y1="44.7" x2="50.4" y2="50.4"/>
    <line x1="13.6" y1="50.4" x2="19.3" y2="44.7"/>
    <line x1="44.7" y1="19.3" x2="50.4" y2="13.6"/>
  </svg>`,

  "clear-night": `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
    <path d="M38 10a22 22 0 1 0 16 38A18 18 0 0 1 38 10z"/>
  </svg>`,

  cloudy: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
    <path d="M20 46a12 12 0 0 1-1.2-23.9 16 16 0 0 1 30.4-2A10 10 0 0 1 48 40H20z"/>
  </svg>`,

  "partly-cloudy": `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
    <circle cx="24" cy="22" r="8"/>
    <line x1="24" y1="8" x2="24" y2="12"/>
    <line x1="24" y1="32" x2="24" y2="36"/>
    <line x1="12" y1="22" x2="16" y2="22"/>
    <line x1="32" y1="22" x2="36" y2="22"/>
    <line x1="15.5" y1="13.5" x2="18.3" y2="16.3"/>
    <line x1="29.7" y1="27.7" x2="32.5" y2="30.5"/>
    <line x1="15.5" y1="30.5" x2="18.3" y2="27.7"/>
    <line x1="29.7" y1="16.3" x2="32.5" y2="13.5"/>
    <path d="M22 52a10 10 0 0 1-1-19.9 13 13 0 0 1 24.7-1.6A8 8 0 0 1 44 48H22z"/>
  </svg>`,

  rain: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
    <path d="M18 38a10 10 0 0 1-1-19.9 14 14 0 0 1 26.7-1.8A8 8 0 0 1 42 34H18z"/>
    <line x1="22" y1="42" x2="18" y2="52"/>
    <line x1="32" y1="42" x2="28" y2="52"/>
    <line x1="42" y1="42" x2="38" y2="52"/>
  </svg>`,

  snow: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
    <path d="M18 36a10 10 0 0 1-1-19.9 14 14 0 0 1 26.7-1.8A8 8 0 0 1 42 32H18z"/>
    <circle cx="20" cy="46" r="2"/>
    <circle cx="32" cy="44" r="2"/>
    <circle cx="44" cy="46" r="2"/>
    <circle cx="26" cy="54" r="2"/>
    <circle cx="38" cy="54" r="2"/>
  </svg>`,

  thunderstorm: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
    <path d="M18 36a10 10 0 0 1-1-19.9 14 14 0 0 1 26.7-1.8A8 8 0 0 1 42 32H18z"/>
    <polyline points="30,38 26,48 34,48 28,58"/>
  </svg>`,

  fog: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
    <line x1="12" y1="28" x2="52" y2="28"/>
    <line x1="16" y1="36" x2="48" y2="36"/>
    <line x1="12" y1="44" x2="52" y2="44"/>
    <line x1="20" y1="52" x2="44" y2="52"/>
  </svg>`,

  drizzle: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
    <path d="M18 38a10 10 0 0 1-1-19.9 14 14 0 0 1 26.7-1.8A8 8 0 0 1 42 34H18z"/>
    <line x1="22" y1="43" x2="20" y2="49"/>
    <line x1="32" y1="43" x2="30" y2="49"/>
    <line x1="42" y1="43" x2="40" y2="49"/>
  </svg>`,

  wind: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
    <path d="M10 28h30a6 6 0 1 0-6-6" fill="none"/>
    <path d="M14 38h24a5 5 0 1 1-5 5" fill="none"/>
    <path d="M10 48h16a4 4 0 1 1-4 4" fill="none"/>
  </svg>`,
};

const aliases = {
  clear: "sunny",
  "clear-day": "sunny",
  sun: "sunny",
  cloud: "cloudy",
  overcast: "cloudy",
  "partly-cloudy-day": "partly-cloudy",
  "partly-cloudy-night": "partly-cloudy",
  "partial-clouds": "partly-cloudy",
  rainy: "rain",
  shower: "rain",
  "light-rain": "drizzle",
  snowy: "snow",
  sleet: "snow",
  thunder: "thunderstorm",
  storm: "thunderstorm",
  mist: "fog",
  haze: "fog",
  windy: "wind",
};

const fallback = icons.cloudy;

export function getWeatherIcon(iconCode) {
  if (!iconCode) return fallback;
  const key = iconCode.toLowerCase().trim();
  return icons[key] || icons[aliases[key]] || fallback;
}
