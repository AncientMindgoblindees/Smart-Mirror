import {
  getLocalUserSettings,
  getMergedWidgetConfigs,
  storeWidgetLayouts,
} from "./services/localMirrorConfig.js";
import {
  initWidgetGridDnD,
  refreshWidgetDragState,
} from "./services/widgetGridDnD.js";
import { startLocalInput } from "./services/localInput.js";
import { emitMirrorEvent } from "./services/mirrorEvents.js";
import { createWidgetContainer, setMirrorLayoutMode, getGridElement } from "./layout.js";
import { mountWidget } from "./widgets/base.js";
import "./widgets/clock.js";
import "./widgets/weather.js";
import "./widgets/calendar.js";

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
      "--fs-display",
      `${settings.primary_font_size}px`
    );
  }
  if (settings.theme === "light") {
    root.setAttribute("data-theme", "light");
  } else if (settings.theme) {
    root.setAttribute("data-theme", String(settings.theme));
  }
}

function loadInitialData() {
  const settings = getLocalUserSettings();
  applyUserSettings(settings);

  const localLayouts = getMergedWidgetConfigs();
  const grid = getGridElement();
  /** @type {HTMLElement[]} */
  const tiles = [];

  localLayouts.forEach((localConfig) => {
    if (!localConfig.enabled) return;
    const { container } = createWidgetContainer(localConfig);
    tiles.push(container);
    const instance = mountWidget(localConfig, container);
    if (instance) {
      widgetInstances.push({ config: localConfig, instance });
    } else if (container && typeof container.remove === "function") {
      container.remove();
    }
  });

  if (grid) {
    setMirrorLayoutMode(grid, interactionState.layoutIndex, tiles);
  }

  initWidgetGridDnD({
    grid,
    getLayoutMode: () => parseInt(grid?.dataset.layout || "0", 10),
    getEntries: () =>
      widgetInstances.map((w) => ({
        widget_id: w.config.widget_id,
        config: w.config,
        container: w.instance.container,
      })),
    onPersist: (configs) => storeWidgetLayouts(configs),
  });

  startUpdateLoops();

  startLocalInput(handleButtonEvent);
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
          iconCode: "partly-cloudy",
          locationName: "Local preview",
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
        const inTwoH = new Date(now.getTime() + 2 * 60 * 60 * 1000);
        const events = [
          {
            id: "1",
            title: "Morning standup",
            start: now.toISOString(),
            end: inThirty.toISOString(),
            allDay: false,
          },
          {
            id: "2",
            title: "Design review",
            start: inThirty.toISOString(),
            end: inTwoH.toISOString(),
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
    interactionState.layoutIndex += 1;
    const grid = getGridElement();
    const tiles = widgetInstances.map((w) => w.instance.container);
    if (grid) {
      setMirrorLayoutMode(grid, interactionState.layoutIndex, tiles);
      refreshWidgetDragState(
        () => parseInt(grid.dataset.layout || "0", 10),
        grid
      );
    }
    emitMirrorEvent("layout", { index: interactionState.layoutIndex });
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
    emitMirrorEvent("display", { mode: interactionState.displayMode });
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
