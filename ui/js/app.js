import { getWidgets, getUserSettings } from "./api.js";
import { createWidgetContainer } from "./layout.js";
import { mountWidget } from "./widgets/base.js";
import { startButtonListener } from "./buttons.js";

const widgetInstances = [];

const interactionState = {
  layoutIndex: 0,
  displayMode: "normal",
};

function applyUserSettings(settings) {
  if (!settings) return;
  const root = document.documentElement;
  if (settings.accent_color) {
    root.style.setProperty("--color-accent", settings.accent_color);
  }
  if (settings.primary_font_size) {
    root.style.setProperty(
      "--fs-primary",
      `${settings.primary_font_size}px`
    );
  }
  if (settings.theme === "light") {
    root.style.setProperty("--color-bg", "#f5f5f5");
    root.style.setProperty("--color-text-primary", "#111111");
    root.style.setProperty("--color-text-secondary", "#444444");
  }
}

async function loadInitialData() {
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
    }
  });

  startUpdateLoops();

  startButtonListener(handleButtonEvent);
}

function startUpdateLoops() {
  widgetInstances.forEach(({ config, instance }) => {
    const defaults = instance.settings ? instance.settings() : {};
    const options = defaults && defaults.options ? defaults.options : {};
    const intervalMs = options.refreshIntervalMs || 0;

    if (config.widget_id === "clock") {
      const tick = () => {
        instance.update();
      };
      tick();
      setInterval(tick, intervalMs || 1000);
    }

    if (config.widget_id === "weather") {
      const tick = () => {
        const data = {
          temperatureC: 21,
          condition: "Partly cloudy",
          iconCode: "cloudy",
          locationName: "Home",
          updatedAt: new Date().toISOString(),
        };
        instance.update(data);
      };
      tick();
      const refresh = intervalMs || 15 * 60 * 1000;
      setInterval(tick, refresh);
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

function handleButtonEvent(evt) {
  const { button_id: buttonId, action } = evt;

  if (buttonId === "LAYOUT" && action === "CLICK") {
    interactionState.layoutIndex =
      (interactionState.layoutIndex + 1) % 4;
    // Phase 2: could trigger different layouts; for now, log.
    // eslint-disable-next-line no-console
    console.log("Layout cycle to index", interactionState.layoutIndex);
  }

  if (buttonId === "DISPLAY") {
    if (action === "CLICK") {
      interactionState.displayMode =
        interactionState.displayMode === "dim" ? "normal" : "dim";
    } else if (action === "LONG_PRESS") {
      interactionState.displayMode =
        interactionState.displayMode === "sleep" ? "normal" : "sleep";
    }
    applyDisplayMode();
  }
}

function applyDisplayMode() {
  const body = document.body;
  body.classList.remove("display-dim", "display-sleep");
  if (interactionState.displayMode === "dim") {
    body.classList.add("display-dim");
  }
  if (interactionState.displayMode === "sleep") {
    body.classList.add("display-sleep");
  }
}

window.addEventListener("DOMContentLoaded", () => {
  loadInitialData();
});

