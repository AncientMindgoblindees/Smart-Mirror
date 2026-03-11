const API_BASE = "/api";

async function jsonRequest(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }

  return res.json();
}

export function getWidgets() {
  return jsonRequest("/widgets/").then((widgets) =>
    Array.isArray(widgets) ? widgets.map(normalizeWidgetConfig) : []
  );
}

export function getUserSettings() {
  return jsonRequest("/user/settings");
}

export async function getCurrentWeather() {
  const payload = await jsonRequest("/weather/current");
  const outdoor = payload.outdoor || null;
  const indoor = payload.indoor || null;
  const cache = payload.cache || null;

  return {
    status: payload.status || "unavailable",
    temperatureC:
      outdoor && typeof outdoor.temperature_c === "number"
        ? outdoor.temperature_c
        : null,
    indoorTemperatureC:
      indoor && typeof indoor.temperature_c === "number"
        ? indoor.temperature_c
        : null,
    condition: outdoor ? outdoor.condition : "Weather unavailable",
    iconCode: outdoor ? outdoor.icon_code : "",
    locationName: payload.location ? payload.location.name : "",
    updatedAt: outdoor ? outdoor.observed_at : null,
    apparentTemperatureC:
      outdoor && typeof outdoor.apparent_temperature_c === "number"
        ? outdoor.apparent_temperature_c
        : null,
    humidityPct:
      outdoor && typeof outdoor.humidity_pct === "number"
        ? outdoor.humidity_pct
        : null,
    windSpeedKph:
      outdoor && typeof outdoor.wind_speed_kph === "number"
        ? outdoor.wind_speed_kph
        : null,
    isDay: outdoor ? Boolean(outdoor.is_day) : true,
    cacheStatus: cache ? cache.status : "miss",
    ageSeconds:
      cache && typeof cache.age_seconds === "number" ? cache.age_seconds : null,
    errorMessage: payload.error_message || "",
  };
}

export function putWidgets(configs) {
  return jsonRequest("/widgets/", {
    method: "PUT",
    body: JSON.stringify(configs),
  });
}

export function putUserSettings(partialSettings) {
  return jsonRequest("/user/settings", {
    method: "PUT",
    body: JSON.stringify(partialSettings),
  });
}

function normalizeWidgetConfig(widget) {
  const configJson = widget && widget.config_json ? { ...widget.config_json } : {};
  return {
    ...widget,
    config_json: configJson,
    zone:
      widget.zone ||
      mapLegacySlotToZone(configJson.slot) ||
      inferDefaultZone(widget.widget_id),
    display_order:
      typeof widget.display_order === "number"
        ? widget.display_order
        : typeof configJson.priority === "number"
          ? configJson.priority
          : widget.position_row * 100 + widget.position_col,
    row_span: Number(widget.row_span || widget.size_rows || 1),
    col_span: Number(widget.col_span || widget.size_cols || 1),
  };
}

function mapLegacySlotToZone(slot) {
  switch (slot) {
    case "hero-left":
      return "hero";
    case "top-right":
      return "right-top";
    case "right-rail":
      return "right-stack";
    default:
      return "";
  }
}

function inferDefaultZone(widgetId) {
  switch (widgetId) {
    case "clock":
      return "hero";
    case "weather":
      return "right-top";
    case "calendar":
      return "right-stack";
    default:
      return "ambient";
  }
}

