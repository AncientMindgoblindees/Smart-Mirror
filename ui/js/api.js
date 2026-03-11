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
  return jsonRequest("/widgets/");
}

export function getUserSettings() {
  return jsonRequest("/user/settings");
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

