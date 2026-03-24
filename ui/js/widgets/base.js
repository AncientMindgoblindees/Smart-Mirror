const widgetRegistry = new Map();

function cloneValue(value) {
  if (Array.isArray(value)) {
    return value.map(cloneValue);
  }
  if (value && typeof value === "object") {
    const out = {};
    Object.keys(value).forEach((key) => {
      out[key] = cloneValue(value[key]);
    });
    return out;
  }
  return value;
}

/**
 * Shared shell for widget chrome.
 * Keeps visual conventions centralized while allowing custom content composition.
 */
export function createWidgetShell(
  container,
  { title = "", className = "", showHeader = true } = {}
) {
  if (className) {
    container.classList.add(className);
  }

  let header = null;
  let label = null;
  if (showHeader && title) {
    header = document.createElement("div");
    header.className = "widget-header";
    label = document.createElement("span");
    label.className = "widget-header-label";
    label.textContent = title;
    header.appendChild(label);
    container.appendChild(header);
  }

  return { header, label };
}

/**
 * Base widget contract for scalable widget implementations.
 * Widgets can override `mount` for advanced behavior while inheriting
 * shared shell and default settings patterns.
 */
export class BaseWidget {
  constructor({ id, title = "", className = "", defaults = {} } = {}) {
    if (!id) throw new Error("BaseWidget requires an id");
    this.id = id;
    this.title = title;
    this.className = className || `widget--${id}`;
    this.defaults = defaults;
  }

  createShell(container, options = {}) {
    return createWidgetShell(container, {
      title: options.title ?? this.title,
      className: options.className ?? this.className,
      showHeader: options.showHeader ?? true,
    });
  }

  settings() {
    const raw = typeof this.defaults === "function" ? this.defaults() : this.defaults;
    return cloneValue(raw || {});
  }

  beforeMount(_surface, _config) {}

  afterMount(_surface, _config, _mountResult) {}

  destroy(_surface, _config) {}

  mount(surface, config) {
    if (typeof this.render === "function") {
      this.render(surface, config);
    }
    const update =
      typeof this.update === "function" ? this.update.bind(this) : () => {};
    return {
      update,
      settings: () => this.settings(),
    };
  }
}

export function registerWidget(widget) {
  if (!widget || !widget.id) throw new Error("Widget must have an id");
  const hasMount = typeof widget.mount === "function";
  const hasRender = typeof widget.render === "function";
  if (!hasMount && !hasRender) {
    throw new Error(`Widget "${widget.id}" must implement mount() or render()`);
  }
  if (widgetRegistry.has(widget.id)) {
    throw new Error(`Widget with id "${widget.id}" already registered`);
  }
  widgetRegistry.set(widget.id, widget);
}

export function getWidget(id) {
  return widgetRegistry.get(id) || null;
}

export function mountWidget(config, mountRoot) {
  const def = getWidget(config.widget_id);
  if (!def) {
    return null;
  }

  const surface =
    mountRoot.querySelector?.(".widget-surface") || mountRoot;

  if (typeof def.beforeMount === "function") {
    def.beforeMount(surface, config);
  }

  let mountResult = null;
  if (typeof def.mount === "function") {
    mountResult = def.mount(surface, config) || null;
  } else if (typeof def.render === "function") {
    def.render(surface, config);
  }

  if (typeof def.afterMount === "function") {
    def.afterMount(surface, config, mountResult);
  }

  const boundUpdate =
    mountResult && typeof mountResult.update === "function"
      ? mountResult.update
      : typeof def.update === "function"
        ? def.update.bind(surface)
        : () => {};
  const settingsFn =
    mountResult && typeof mountResult.settings === "function"
      ? mountResult.settings
      : typeof def.settings === "function"
        ? def.settings.bind(def)
        : () => ({});
  const destroyFn =
    mountResult && typeof mountResult.destroy === "function"
      ? mountResult.destroy
      : typeof def.destroy === "function"
        ? () => def.destroy(surface, config)
        : () => {};

  return {
    id: def.id,
    container: mountRoot,
    surface,
    update: boundUpdate,
    settings: settingsFn,
    destroy: destroyFn,
  };
}

