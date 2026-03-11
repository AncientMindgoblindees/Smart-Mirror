import { registerWidget } from "./base.js";
import { getWeatherIcon } from "./weather-icons.js";

const weatherWidget = {
  id: "weather",

  render(container) {
    container.classList.add("widget--weather");
    container.dataset.weatherState = "loading";

    const header = document.createElement("div");
    header.className = "widget-header";
    header.textContent = "Climate";

    const main = document.createElement("div");
    main.className = "weather-main";

    const iconWrapEl = document.createElement("div");
    iconWrapEl.className = "weather-icon-wrap";

    const tempEl = document.createElement("div");
    tempEl.className = "weather-temp metric-primary";
    tempEl.textContent = "—";

    const iconEl = document.createElement("div");
    iconEl.className = "weather-icon";
    iconEl.innerHTML = getWeatherIcon("cloudy");

    const summaryEl = document.createElement("div");
    summaryEl.className = "weather-summary";

    iconWrapEl.appendChild(iconEl);
    main.appendChild(iconWrapEl);
    main.appendChild(tempEl);
    main.appendChild(summaryEl);

    const meta = document.createElement("div");
    meta.className = "weather-meta";

    const conditionEl = document.createElement("div");
    conditionEl.className = "weather-condition metric-secondary";
    conditionEl.textContent = "Loading…";

    const locationEl = document.createElement("div");
    locationEl.className = "weather-location metric-tertiary";
    locationEl.textContent = "";

    const supportEl = document.createElement("div");
    supportEl.className = "weather-support metric-tertiary";

    const statusEl = document.createElement("div");
    statusEl.className = "weather-status";
    statusEl.textContent = "";

    const indoorEl = document.createElement("div");
    indoorEl.className = "weather-indoor metric-tertiary";
    indoorEl.textContent = "";

    meta.appendChild(conditionEl);
    meta.appendChild(locationEl);
    meta.appendChild(supportEl);
    meta.appendChild(statusEl);
    meta.appendChild(indoorEl);

    container.appendChild(header);
    container.appendChild(main);
    container.appendChild(meta);

    container._weatherEls = {
      tempEl,
      iconEl,
      summaryEl,
      conditionEl,
      locationEl,
      supportEl,
      statusEl,
      indoorEl,
    };
  },

  update(data) {
    const compact = this.dataset.zone === "right-top";
    const {
      tempEl,
      iconEl,
      summaryEl,
      conditionEl,
      locationEl,
      supportEl,
      statusEl,
      indoorEl,
    } =
      this._weatherEls || {};

    if (!data) {
      this.dataset.weatherState = "unavailable";
      if (conditionEl) conditionEl.textContent = "Offline";
      if (tempEl) tempEl.textContent = "—";
      if (locationEl) locationEl.textContent = "";
      if (supportEl) supportEl.textContent = "";
      if (statusEl) statusEl.textContent = "Weather unavailable";
      if (indoorEl) indoorEl.textContent = "";
      if (summaryEl) summaryEl.textContent = "";
      if (iconEl) iconEl.innerHTML = getWeatherIcon("cloudy");
      return;
    }

    this.dataset.weatherState = data.status || "ok";

    if (tempEl) {
      tempEl.textContent =
        typeof data.temperatureC === "number"
          ? `${Math.round(data.temperatureC)}°`
          : "—";
    }
    if (conditionEl) conditionEl.textContent = data.condition || "Unavailable";
    if (locationEl) locationEl.textContent = data.locationName || "";
    if (summaryEl) {
      summaryEl.textContent = data.isDay ? "Daylight" : "Night";
    }
    if (supportEl) {
      supportEl.textContent = compact ? "" : buildSupportLine(data);
    }
    if (statusEl) {
      const updatedLabel = data.updatedAt ? formatUpdatedAt(data.updatedAt) : "";
      statusEl.textContent =
        data.status === "stale" || data.cacheStatus === "stale"
          ? "Using cached weather"
          : data.errorMessage
            ? data.errorMessage
            : compact
              ? ""
              : updatedLabel
            ? `Updated ${updatedLabel}`
            : "";
    }
    if (indoorEl) {
      indoorEl.textContent =
        !compact && typeof data.indoorTemperatureC === "number"
          ? `Inside ${Math.round(data.indoorTemperatureC)}°`
          : "";
    }
    if (iconEl) iconEl.innerHTML = getWeatherIcon(data.iconCode);
  },

  settings() {
    return {
      widget_id: "weather",
      enabled: true,
      position_row: 1,
      position_col: 8,
      size_rows: 2,
      size_cols: 5,
      zone: "right-top",
      display_order: 20,
      row_span: 1,
      col_span: 2,
      config_json: null,
      options: {
        units: "metric",
        refreshIntervalMs: 15 * 60 * 1000,
      },
    };
  },
};

function formatUpdatedAt(value) {
  const updatedAt = new Date(value);
  if (Number.isNaN(updatedAt.getTime())) {
    return "";
  }
  return updatedAt.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildSupportLine(data) {
  const segments = [];
  if (typeof data.apparentTemperatureC === "number") {
    segments.push(`Feels ${Math.round(data.apparentTemperatureC)}°`);
  }
  if (typeof data.humidityPct === "number") {
    segments.push(`${data.humidityPct}% humidity`);
  }
  if (typeof data.windSpeedKph === "number") {
    segments.push(`${Math.round(data.windSpeedKph)} kph wind`);
  }
  return segments.slice(0, 2).join(" • ");
}

registerWidget(weatherWidget);
export default weatherWidget;

