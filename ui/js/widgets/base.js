const widgetRegistry = new Map();

export function registerWidget(widget) {
  if (!widget || !widget.id) throw new Error("Widget must have an id");
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

  def.render(surface, config);

  const boundUpdate =
    typeof def.update === "function" ? def.update.bind(surface) : () => {};
  const settingsFn =
    typeof def.settings === "function" ? def.settings : () => ({});

  return {
    id: def.id,
    container: mountRoot,
    surface,
    update: boundUpdate,
    settings: settingsFn,
  };
}

