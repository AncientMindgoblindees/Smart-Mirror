import { getWidgets, getUserSettings } from "./api.js";
import { createWidgetContainer } from "./layout.js";
import { mountWidget } from "./widgets/base.js";

const widgetInstances = [];

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

  const enabledWidgets = widgets.filter((w) => w.enabled);
  enabledWidgets.forEach((config) => {
    const container = createWidgetContainer(config);
    const instance = mountWidget(config, container);
    if (instance) {
      widgetInstances.push({ config, instance });
    }
  });

  startUpdateLoops();
}

function startUpdateLoops() {
  widgetInstances.forEach(({ config, instance }) => {
    const defaults = instance.settings();
    const options = defaults && defaults.options ? defaults.options : {};
    const intervalMs = options.refreshIntervalMs || 0;

    if (config.widget_id === "clock") {
      const target = instance;
      setInterval(() => {
        target.update.call(
          target.container || target,
          undefined
        );
      }, intervalMs || 1000);
    }

    if (config.widget_id === "weather") {
      const target = instance;
      const tick = () => {
        const data = {
          temperatureC: 21,
          condition: "Partly cloudy",
          iconCode: "cloudy",
          locationName: "Home",
          updatedAt: new Date().toISOString(),
        };
        target.update.call(
          target.container || target,
          data
        );
      };
      tick();
      const refresh = intervalMs || 15 * 60 * 1000;
      setInterval(tick, refresh);
    }

    if (config.widget_id === "calendar") {
      const target = instance;
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
        target.update.call(
          target.container || target,
          { events }
        );
      };
      tick();
      const refresh = intervalMs || 5 * 60 * 1000;
      setInterval(tick, refresh);
    }
  });
}

window.addEventListener("DOMContentLoaded", () => {
  loadInitialData();
});

