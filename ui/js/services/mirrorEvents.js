/**
 * Lightweight pub/sub for cross-widget shell concerns (theme, layout, refresh).
 * Widgets stay decoupled; optional subscribe from any module.
 */

const ROOT = window;

/**
 * @param {string} name
 * @param {unknown} [detail]
 */
export function emitMirrorEvent(name, detail) {
  ROOT.dispatchEvent(new CustomEvent(`mirror:${name}`, { detail }));
}

/**
 * @param {string} name
 * @param {(detail: unknown) => void} handler
 * @returns {() => void}
 */
export function onMirrorEvent(name, handler) {
  const type = `mirror:${name}`;
  const fn = (e) => handler(e.detail);
  ROOT.addEventListener(type, fn);
  return () => ROOT.removeEventListener(type, fn);
}
