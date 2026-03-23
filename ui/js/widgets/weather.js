import { registerWidget } from "./base.js";

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

const weatherWidget = {
  id: "weather",

  render(container) {
    container.classList.add("widget--weather");

    const header = document.createElement("div");
    header.className = "widget-header";
    const label = document.createElement("span");
    label.className = "widget-header-label";
    label.textContent = "Weather";
    header.appendChild(label);

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

    container.appendChild(header);
    container.appendChild(main);
    container.appendChild(meta);

    container._weatherEls = { tempEl, iconEl, conditionEl, locationEl };
  },

  update(data) {
    const { tempEl, iconEl, conditionEl, locationEl } = this._weatherEls || {};

    if (!data) {
      if (conditionEl) conditionEl.textContent = "Offline";
      if (tempEl) tempEl.textContent = "—";
      if (iconEl) iconEl.textContent = "";
      return;
    }

    if (tempEl) tempEl.textContent = `${Math.round(data.temperatureC)}°`;
    if (conditionEl) conditionEl.textContent = data.condition || "";
    if (locationEl) locationEl.textContent = data.locationName || "";
    if (iconEl) iconEl.textContent = iconFor(data.iconCode);
  },

  settings() {
    return {
      widget_id: "weather",
      enabled: true,
      position_row: 1,
      position_col: 3,
      size_rows: 2,
      size_cols: 2,
      options: {
        units: "metric",
        refreshIntervalMs: 15 * 60 * 1000,
      },
    };
  },
};

registerWidget(weatherWidget);
export default weatherWidget;
