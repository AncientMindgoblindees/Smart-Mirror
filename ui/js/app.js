import { getCurrentWeather, getWidgets, getUserSettings } from "./api.js";
import { createWidgetContainer, renderLayoutMode } from "./layout.js";
import { mountWidget } from "./widgets/base.js";
import { startButtonListener } from "./buttons.js";

const widgetInstances = [];
const LAYOUT_MODES = ["home", "weather-focus", "agenda-focus", "minimal"];

const interactionState = {
  layoutIndex: 0,
  displayMode: "normal",
};

function applyUserSettings(settings) {
  if (!settings) return;
  const root = document.documentElement;
  if (settings.accent_color) {
    root.style.setProperty("--color-accent", settings.accent_color);
    root.style.setProperty("--color-accent-soft", `${settings.accent_color}33`);
  }
  if (settings.primary_font_size) {
    const displaySize = Math.max(settings.primary_font_size, 120);
    root.style.setProperty(
      "--fs-display",
      `${displaySize}px`
    );
    root.style.setProperty("--fs-hero", `${Math.round(displaySize * 0.67)}px`);
  }
  if (settings.theme === "light") {
    root.style.setProperty("--color-bg", "#f5f5f5");
    root.style.setProperty("--color-text-primary", "#111111");
    root.style.setProperty("--color-text-secondary", "#444444");
    root.style.setProperty("--color-text-muted", "#666666");
  }
}

async function loadInitialData() {
  renderLayoutMode(LAYOUT_MODES[interactionState.layoutIndex]);
  const [settings, widgets] = await Promise.all([
    getUserSettings().catch(() => null),
    getWidgets().catch(() => []),
  ]);

  applyUserSettings(settings);

  const enabledWidgets =
    widgets && widgets.length ? widgets.filter((w) => w.enabled) : [];
  enabledWidgets.forEach((config) => {
    const container = createWidgetContainer(config);
    const instance = mountWidget(config, container);
    if (instance) {
      widgetInstances.push({ config, instance });
    } else if (container && typeof container.remove === "function") {
      container.remove();
    }
  });

  startUpdateLoops();

  startButtonListener(handleButtonEvent);
}

function startUpdateLoops() {
  widgetInstances.forEach(({ config, instance }) => {
    const options = getWidgetOptions(config, instance);
    const intervalMs = options.refreshIntervalMs || 0;

    if (config.widget_id === "clock") {
      const tick = () => {
        instance.update();
      };
      tick();
      setInterval(tick, intervalMs || 1000);
    }

    if (config.widget_id === "weather") {
      const tick = async () => {
        try {
          const data = await getCurrentWeather();
          instance.update(data);
        } catch {
          instance.update(null);
        }
      };
      void tick();
      const refresh = intervalMs || 15 * 60 * 1000;
      setInterval(() => {
        void tick();
      }, refresh);
    }

    if (config.widget_id === "calendar") {
      const tick = () => {
        const now = new Date();
        const inThirty = new Date(now.getTime() + 30 * 60 * 1000);
        const events = [
          {
            id: "1",
            title: "Morning standup",
            start: now.toISOString(),
            end: inThirty.toISOString(),
            allDay: false,
          },
        ];
        instance.update({ events });
      };
      tick();
      const refresh = intervalMs || 5 * 60 * 1000;
      setInterval(tick, refresh);
    }
  });
}

function getWidgetOptions(config, instance) {
  const defaults = instance.settings ? instance.settings() : {};
  const defaultOptions = defaults && defaults.options ? defaults.options : {};
  const configOptions = config && config.config_json ? config.config_json : {};
  return {
    ...defaultOptions,
    ...configOptions,
  };
}

function handleButtonEvent(evt) {
  const { button_id: buttonId, action } = evt;

  if (buttonId === "LAYOUT" && action === "CLICK") {
    interactionState.layoutIndex =
      (interactionState.layoutIndex + 1) % LAYOUT_MODES.length;
    applyLayoutMode();
  }

  if (buttonId === "DISPLAY") {
    if (action === "CLICK") {
      interactionState.displayMode =
        interactionState.displayMode === "sleep"
          ? "normal"
          : interactionState.displayMode === "dim"
            ? "normal"
            : "dim";
    } else if (action === "LONG_PRESS") {
      interactionState.displayMode =
        interactionState.displayMode === "sleep" ? "normal" : "sleep";
    }
    applyDisplayMode();
  }
}

function applyDisplayMode() {
  const body = document.body;
  body.dataset.displayMode = interactionState.displayMode;
}

function applyLayoutMode() {
  const mode = LAYOUT_MODES[interactionState.layoutIndex];
  document.body.dataset.layoutMode = mode;
  renderLayoutMode(mode);
}

window.addEventListener("DOMContentLoaded", () => {
  applyDisplayMode();
  applyLayoutMode();
  loadInitialData();
});

