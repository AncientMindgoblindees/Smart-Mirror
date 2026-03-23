/**
 * Runtime hook registry for future external integrations.
 * Hooks are optional and never allowed to break the core UI.
 */

export const EXTERNAL_HOOKS = Object.freeze({
  CAMERA_MODE_CHANGED: "camera_mode_changed",
  DISPLAY_MODE_CHANGED: "display_mode_changed",
  LAYOUT_CHANGED: "layout_changed",
  WIDGETS_CHANGED: "widgets_changed",
  WIDGET_UPDATED: "widget_updated",
});

const registry = new Map();

/**
 * @param {string} hookName
 * @param {(payload: unknown) => void | Promise<void>} handler
 */
export function registerExternalHook(hookName, handler) {
  if (!registry.has(hookName)) {
    registry.set(hookName, new Set());
  }
  registry.get(hookName)?.add(handler);
  return () => {
    registry.get(hookName)?.delete(handler);
  };
}

/**
 * @param {string} hookName
 * @param {unknown} payload
 */
export async function emitExternalHook(hookName, payload) {
  const handlers = registry.get(hookName);
  if (!handlers || handlers.size === 0) return;
  const jobs = [...handlers].map(async (handler) => {
    try {
      await handler(payload);
    } catch {
      // Keep mirror resilient if external handlers fail.
    }
  });
  await Promise.all(jobs);
}
