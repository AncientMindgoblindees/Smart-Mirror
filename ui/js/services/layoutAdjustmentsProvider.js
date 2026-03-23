import { storeWidgetLayouts } from "./localMirrorConfig.js";

/**
 * Pluggable adapter for widget layout adjustments.
 * Default provider stores locally; external services can override selectively.
 */

const defaultProvider = {
  /**
   * @param {object[]} configs
   * @returns {object[] | Promise<object[]>}
   */
  hydrateWidgetConfigs(configs) {
    return configs;
  },

  /**
   * @param {object[]} configs
   * @returns {void | Promise<void>}
   */
  persistWidgetLayouts(configs) {
    storeWidgetLayouts(configs);
  },

  /**
   * @param {object} _payload
   * @returns {void | Promise<void>}
   */
  onWidgetTransformChanged(_payload) {},

  /**
   * @param {object} _payload
   * @returns {void | Promise<void>}
   */
  onOrientationChanged(_payload) {},
};

let activeProvider = defaultProvider;

/**
 * @param {Partial<typeof defaultProvider>} provider
 */
export function setLayoutAdjustmentProvider(provider) {
  if (!provider || typeof provider !== "object") {
    activeProvider = defaultProvider;
    return;
  }
  activeProvider = {
    ...defaultProvider,
    ...provider,
  };
}

export function getLayoutAdjustmentProvider() {
  return activeProvider;
}

/**
 * @param {object[]} configs
 * @returns {Promise<object[]>}
 */
export async function hydrateWidgetConfigs(configs) {
  try {
    const out = await Promise.resolve(activeProvider.hydrateWidgetConfigs(configs));
    return Array.isArray(out) ? out : configs;
  } catch {
    return configs;
  }
}

/**
 * @param {object[]} configs
 * @returns {Promise<void>}
 */
export async function persistWidgetLayouts(configs) {
  try {
    await Promise.resolve(activeProvider.persistWidgetLayouts(configs));
  } catch {
    // Keep core UI resilient if external provider fails.
  }
}

/**
 * @param {object} payload
 * @returns {Promise<void>}
 */
export async function notifyWidgetTransformChanged(payload) {
  try {
    await Promise.resolve(activeProvider.onWidgetTransformChanged(payload));
  } catch {
    // Keep core UI resilient if external provider fails.
  }
}

/**
 * @param {object} payload
 * @returns {Promise<void>}
 */
export async function notifyOrientationChanged(payload) {
  try {
    await Promise.resolve(activeProvider.onOrientationChanged(payload));
  } catch {
    // Keep core UI resilient if external provider fails.
  }
}
