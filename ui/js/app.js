import {
  getLocalUserSettings,
  getMergedWidgetConfigs,
} from "./services/localMirrorConfig.js";
import {
  ensureFreeformRect,
  initWidgetGridDnD,
  refreshWidgetDragState,
} from "./services/widgetGridDnD.js";
import { startLocalInput } from "./services/localInput.js";
import { emitMirrorEvent } from "./services/mirrorEvents.js";
import {
  createWidgetContainer,
  getGridElement,
  MIRROR_LAYOUT_MODES,
  setMirrorLayoutMode,
} from "./layout.js";
import { mountWidget } from "./widgets/base.js";
import { getCameraFeedSource, postExternalHookEvent } from "./api.js";
import { startCameraFeed } from "./services/cameraFeed.js";
import { EXTERNAL_HOOKS, emitExternalHook } from "./services/externalHooks.js";
import {
  hydrateWidgetConfigs,
  notifyOrientationChanged,
  notifyWidgetTransformChanged,
  persistWidgetLayouts,
} from "./services/layoutAdjustmentsProvider.js";
import "./widgets/clock.js";
import "./widgets/weather.js";
import "./widgets/calendar.js";

const runtime = {
  widgetInstances: [],
  intervals: [],
  stopInput: null,
  destroyDnD: null,
  stopCamera: null,
  stopOrientationSync: null,
  widgetConfigs: [],
  toolsBound: false,
  toolsVisible: true,
  keyboardBound: false,
};

const interactionState = {
  layoutIndex: 0,
  displayMode: "normal",
  cameraMode: "dashboard",
};

function applyUserSettings(settings) {
  if (!settings) return;
  const root = document.documentElement;
  if (settings.accent_color) {
    root.style.setProperty("--color-accent", settings.accent_color);
  }
  if (settings.primary_font_size) {
    root.style.setProperty("--fs-display", `${settings.primary_font_size}px`);
  }
  if (settings.theme === "light") {
    root.setAttribute("data-theme", "light");
  } else if (settings.theme) {
    root.setAttribute("data-theme", String(settings.theme));
  }
}

function clearRuntime() {
  runtime.intervals.forEach((id) => clearInterval(id));
  runtime.intervals = [];
  runtime.destroyDnD?.();
  runtime.destroyDnD = null;
  runtime.widgetInstances = [];
}

function renderWidgetGrid() {
  const grid = getGridElement();
  if (!grid) return;
  grid.innerHTML = "";
  clearRuntime();
  /** @type {HTMLElement[]} */
  const tiles = [];

  runtime.widgetConfigs.forEach((localConfig) => {
    if (!localConfig.enabled) return;
    const { container } = createWidgetContainer(localConfig);
    tiles.push(container);
    const instance = mountWidget(localConfig, container);
    if (instance) {
      runtime.widgetInstances.push({ config: localConfig, instance });
    } else if (container && typeof container.remove === "function") {
      container.remove();
    }
  });

  setMirrorLayoutMode(grid, interactionState.layoutIndex, tiles);

  runtime.destroyDnD = initWidgetGridDnD({
    grid,
    getLayoutMode: () => parseInt(grid?.dataset.layout || "0", 10),
    getEntries: () =>
      runtime.widgetInstances.map((w) => ({
        widget_id: w.config.widget_id,
        config: w.config,
        container: w.instance.container,
      })),
    onRequestFreeformLayout: () => {
      const g = getGridElement();
      if (!g) return;
      const entries = runtime.widgetInstances.map((w) => ({
        widget_id: w.config.widget_id,
        config: w.config,
        container: w.instance.container,
      }));
      entries.forEach((e) => ensureFreeformRect(g, e));
      const mod = interactionState.layoutIndex % MIRROR_LAYOUT_MODES;
      if (mod !== 0) {
        interactionState.layoutIndex -= mod;
      }
      const tiles = runtime.widgetInstances.map((w) => w.instance.container);
      setMirrorLayoutMode(g, interactionState.layoutIndex, tiles);
      refreshWidgetDragState(() => parseInt(g.dataset.layout || "0", 10), g);
      persistWidgetLayouts(runtime.widgetConfigs);
    },
    onPersist: (configs) => {
      runtime.widgetConfigs = runtime.widgetConfigs.map((existing) => {
        const updated = configs.find((c) => c.widget_id === existing.widget_id);
        return updated ? { ...existing, ...updated } : existing;
      });
      persistWidgetLayouts(runtime.widgetConfigs);
    },
    onTransform: (entry, phase) => {
      if (phase !== "final") return;
      const payload = {
        widget_id: entry.widget_id,
        freeform_x: entry.config.freeform_x,
        freeform_y: entry.config.freeform_y,
        freeform_width: entry.config.freeform_width,
        freeform_height: entry.config.freeform_height,
        ts: new Date().toISOString(),
      };
      notifyWidgetTransformChanged(payload);
      emitExternalHook(EXTERNAL_HOOKS.WIDGET_TRANSFORM_CHANGED, payload);
      postExternalHookEvent("widget_transform_changed", payload).catch(() => {});
    },
  });

  startUpdateLoops();
}

async function loadInitialData() {
  const settings = getLocalUserSettings();
  applyUserSettings(settings);
  const localConfigs = getMergedWidgetConfigs();
  runtime.widgetConfigs = await hydrateWidgetConfigs(localConfigs);
  renderWidgetGrid();
  renderTools();
  applyToolsVisibility();
  runtime.stopInput = startLocalInput(handleButtonEvent);
  runtime.stopOrientationSync = startOrientationSync();
  bindKeyboardShortcuts();
}

function startOrientationSync() {
  let lastOrientation = "";
  const apply = () => {
    const orientation =
      window.innerHeight >= window.innerWidth ? "vertical" : "horizontal";
    if (orientation === lastOrientation) return;
    lastOrientation = orientation;
    document.documentElement.dataset.orientation = orientation;
    const payload = { orientation, ts: new Date().toISOString() };
    notifyOrientationChanged(payload);
    emitExternalHook(EXTERNAL_HOOKS.ORIENTATION_CHANGED, payload);
    postExternalHookEvent("orientation_changed", payload).catch(() => {});
  };
  apply();
  window.addEventListener("resize", apply);
  window.addEventListener("orientationchange", apply);
  return () => {
    window.removeEventListener("resize", apply);
    window.removeEventListener("orientationchange", apply);
  };
}

function startUpdateLoops() {
  runtime.widgetInstances.forEach(({ config, instance }) => {
    const defaults = instance.settings ? instance.settings() : {};
    const options = defaults && defaults.options ? defaults.options : {};
    const intervalMs = options.refreshIntervalMs || 0;

    if (config.widget_id.startsWith("clock")) {
      const tick = () => {
        instance.update();
        emitExternalHook(EXTERNAL_HOOKS.WIDGET_UPDATED, {
          widget_id: config.widget_id,
          ts: new Date().toISOString(),
        });
      };
      tick();
      runtime.intervals.push(setInterval(tick, intervalMs || 1000));
    }

    if (config.widget_id.startsWith("weather")) {
      const tick = () => {
        const data = {
          temperatureC: 21,
          condition: "Partly cloudy",
          iconCode: "partly-cloudy",
          locationName: "Local preview",
          updatedAt: new Date().toISOString(),
        };
        instance.update(data);
        emitExternalHook(EXTERNAL_HOOKS.WIDGET_UPDATED, {
          widget_id: config.widget_id,
          ts: new Date().toISOString(),
        });
      };
      tick();
      const refresh = intervalMs || 15 * 60 * 1000;
      runtime.intervals.push(setInterval(tick, refresh));
    }

    if (config.widget_id.startsWith("calendar")) {
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
        emitExternalHook(EXTERNAL_HOOKS.WIDGET_UPDATED, {
          widget_id: config.widget_id,
          ts: new Date().toISOString(),
        });
      };
      tick();
      const refresh = intervalMs || 5 * 60 * 1000;
      runtime.intervals.push(setInterval(tick, refresh));
    }
  });
}

function handleButtonEvent(evt) {
  const { button_id: buttonId, action } = evt;

  if (buttonId === "LAYOUT" && action === "CLICK") {
    interactionState.layoutIndex += 1;
    const grid = getGridElement();
    const tiles = runtime.widgetInstances.map((w) => w.instance.container);
    if (grid) {
      setMirrorLayoutMode(grid, interactionState.layoutIndex, tiles);
      refreshWidgetDragState(() => parseInt(grid.dataset.layout || "0", 10), grid);
    }
    emitMirrorEvent("layout", { index: interactionState.layoutIndex });
    emitExternalHook(EXTERNAL_HOOKS.LAYOUT_CHANGED, {
      index: interactionState.layoutIndex,
      ts: new Date().toISOString(),
    });
    postExternalHookEvent("layout_changed", {
      index: interactionState.layoutIndex,
    }).catch(() => {});
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
    emitExternalHook(EXTERNAL_HOOKS.DISPLAY_MODE_CHANGED, {
      mode: interactionState.displayMode,
      ts: new Date().toISOString(),
    });
    postExternalHookEvent("display_mode_changed", {
      mode: interactionState.displayMode,
    }).catch(() => {});
  }

  if (buttonId === "CAMERA" && action === "CLICK") {
    toggleCameraMode();
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

function onToggleWidget(widgetId, enabled) {
  const target = runtime.widgetConfigs.find((w) => w.widget_id === widgetId);
  if (!target) return;
  target.enabled = enabled;
  persistWidgetLayouts(runtime.widgetConfigs);
  renderWidgetGrid();
  renderTools();
  emitExternalHook(EXTERNAL_HOOKS.WIDGETS_CHANGED, {
    widgets: runtime.widgetConfigs.map((w) => ({
      widget_id: w.widget_id,
      enabled: w.enabled,
    })),
    ts: new Date().toISOString(),
  });
  postExternalHookEvent("widgets_changed", {
    widgets: runtime.widgetConfigs.map((w) => ({
      widget_id: w.widget_id,
      enabled: w.enabled,
    })),
  }).catch(() => {});
}

function isTypingTarget(el) {
  if (!(el instanceof Element)) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return el.closest("[contenteditable='true']") != null;
}

function applyToolsVisibility() {
  const tools = document.querySelector(".mirror-tools");
  if (!(tools instanceof HTMLElement)) return;
  const show = runtime.toolsVisible && !document.body.classList.contains("view-camera");
  tools.classList.toggle("mirror-tools--hidden", !show);
  tools.setAttribute("aria-hidden", show ? "false" : "true");
}

function toggleToolsPanel() {
  if (document.body.classList.contains("view-camera")) return;
  runtime.toolsVisible = !runtime.toolsVisible;
  applyToolsVisibility();
}

function bindKeyboardShortcuts() {
  if (runtime.keyboardBound) return;
  runtime.keyboardBound = true;
  window.addEventListener("keydown", (e) => {
    if (e.defaultPrevented) return;
    if (e.repeat) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (isTypingTarget(e.target)) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (k === "d") {
      e.preventDefault();
      toggleToolsPanel();
    }
  });
}

function renderTools() {
  const cameraBtn = document.getElementById("tool-toggle-camera");
  const cycleLayoutBtn = document.getElementById("tool-cycle-layout");
  const toggleDisplayBtn = document.getElementById("tool-toggle-display");
  const widgetList = document.getElementById("tool-widget-list");
  const cameraCloseBtn = document.getElementById("camera-close");

  if (!runtime.toolsBound) {
    cameraBtn?.addEventListener("click", () => toggleCameraMode());
    cycleLayoutBtn?.addEventListener("click", () =>
      handleButtonEvent({ button_id: "LAYOUT", action: "CLICK" })
    );
    toggleDisplayBtn?.addEventListener("click", () =>
      handleButtonEvent({ button_id: "DISPLAY", action: "CLICK" })
    );
    cameraCloseBtn?.addEventListener("click", () => toggleCameraMode("dashboard"));
    runtime.toolsBound = true;
  }

  if (!widgetList) return;
  widgetList.innerHTML = "";
  runtime.widgetConfigs.forEach((config) => {
    const row = document.createElement("label");
    row.className = "mirror-tools__widget-row";
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = !!config.enabled;
    box.addEventListener("change", () => onToggleWidget(config.widget_id, box.checked));
    const name = document.createElement("span");
    name.textContent = config.widget_id;
    row.appendChild(box);
    row.appendChild(name);
    widgetList.appendChild(row);
  });
}

async function toggleCameraMode(forcedMode = null) {
  const cameraStage = document.getElementById("camera-stage");
  const cameraVideo = document.getElementById("camera-video");
  const cameraStatus = document.getElementById("camera-status");
  if (!(cameraStage instanceof HTMLElement)) return;
  if (!(cameraVideo instanceof HTMLVideoElement)) return;

  const enteringCamera =
    forcedMode === "camera" ||
    (!forcedMode && interactionState.cameraMode !== "camera");

  if (!enteringCamera) {
    interactionState.cameraMode = "dashboard";
    document.body.classList.remove("view-camera");
    applyToolsVisibility();
    cameraStage.setAttribute("aria-hidden", "true");
    runtime.stopCamera?.();
    runtime.stopCamera = null;
    if (cameraStatus) cameraStatus.textContent = "Camera offline";
    emitMirrorEvent("camera", { mode: "dashboard" });
    emitExternalHook(EXTERNAL_HOOKS.CAMERA_MODE_CHANGED, {
      mode: "dashboard",
      ts: new Date().toISOString(),
    });
    postExternalHookEvent("camera_mode_changed", { mode: "dashboard" }).catch(
      () => {}
    );
    return;
  }

  interactionState.cameraMode = "camera";
  document.body.classList.add("view-camera");
  applyToolsVisibility();
  cameraStage.setAttribute("aria-hidden", "false");

  try {
    const source = await getCameraFeedSource().catch(() => null);
    runtime.stopCamera = await startCameraFeed(cameraVideo, {
      preferredSource: source,
      onStatus: (status) => {
        if (!cameraStatus) return;
        if (status === "starting") cameraStatus.textContent = "Starting camera...";
        if (status === "stream-url") cameraStatus.textContent = "Camera stream active";
        if (status === "live") cameraStatus.textContent = "Camera connected";
        if (status === "unsupported") cameraStatus.textContent = "Camera unsupported";
      },
    });
    emitMirrorEvent("camera", {
      mode: "camera",
      source_mode: source?.mode || "local",
    });
    emitExternalHook(EXTERNAL_HOOKS.CAMERA_MODE_CHANGED, {
      mode: "camera",
      source_mode: source?.mode || "local",
      ts: new Date().toISOString(),
    });
    postExternalHookEvent("camera_mode_changed", {
      mode: "camera",
      source_mode: source?.mode || "local",
    }).catch(() => {});
  } catch {
    if (cameraStatus) {
      cameraStatus.textContent = "Camera unavailable";
    }
  }
}

window.addEventListener("DOMContentLoaded", () => {
  loadInitialData().catch(() => {});
  window.addEventListener("beforeunload", () => {
    runtime.stopInput?.();
    runtime.stopCamera?.();
    runtime.stopOrientationSync?.();
    clearRuntime();
  });
});
