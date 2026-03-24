import { BaseWidget, registerWidget } from "./base.js";
import { getDefaultWidgetLayout } from "./defaultLayouts.js";

const ICONS = {
  sunny: "☀",
  clear: "☀",
  cloudy: "☁",
  "partly-cloudy": "⛅",
  rain: "🌧",
  storm: "⛈",
  snow: "❄",
  fog: "🌫",
  wind: "〰",
};

function iconFor(code) {
  if (!code || typeof code !== "string") return "◌";
  const key = code.toLowerCase().replace(/\s+/g, "-");
  return ICONS[key] || "◌";
}

class WeatherWidget extends BaseWidget {
  constructor() {
    const defaults = getDefaultWidgetLayout("weather");
    if (!defaults) throw new Error('Missing default layout for "weather"');
    super({
      id: "weather",
      title: "Weather",
      className: "widget--weather",
      defaults,
    });
  }

  mount(container) {
    this.createShell(container);

    const main = document.createElement("div");
    main.className = "weather-main";

    const tempEl = document.createElement("div");
    tempEl.className = "weather-temp metric-primary";
    tempEl.textContent = "—";

    const iconWrap = document.createElement("div");
    iconWrap.className = "weather-icon-wrap";
    const iconEl = document.createElement("span");
    iconEl.className = "weather-icon";
    iconEl.setAttribute("aria-hidden", "true");
    iconWrap.appendChild(iconEl);

    main.appendChild(tempEl);
    main.appendChild(iconWrap);

    const meta = document.createElement("div");
    meta.className = "weather-meta";

    const conditionEl = document.createElement("div");
    conditionEl.className = "weather-condition metric-secondary";
    conditionEl.textContent = "Loading…";

    const locationEl = document.createElement("div");
    locationEl.className = "weather-location metric-tertiary";
    locationEl.textContent = "";

    meta.appendChild(conditionEl);
    meta.appendChild(locationEl);

    container.appendChild(main);
    container.appendChild(meta);

    const update = (data) => {
      if (!data) {
        conditionEl.textContent = "Offline";
        tempEl.textContent = "—";
        iconEl.textContent = "";
        return;
      }

      tempEl.textContent = `${Math.round(data.temperatureC)}°`;
      conditionEl.textContent = data.condition || "";
      locationEl.textContent = data.locationName || "";
      iconEl.textContent = iconFor(data.iconCode);
    };

    return {
      update,
      settings: () => this.settings(),
    };
  }
}

const weatherWidget = new WeatherWidget();
registerWidget(weatherWidget);
export default weatherWidget;
