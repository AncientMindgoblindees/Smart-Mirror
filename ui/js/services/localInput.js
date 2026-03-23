/**
 * Local-only input (keyboard). GPIO / WebSocket can be layered in later without changing widgets.
 */

/** @typedef {{ button_id: string, action: string, effect?: string }} ButtonEvent */

/**
 * @param {(evt: ButtonEvent) => void} onEvent
 */
export function startLocalInput(onEvent) {
  const onKeyDown = (e) => {
    if (e.key === "1") {
      onEvent({ button_id: "LAYOUT", action: "CLICK", effect: "cycle_layout" });
    }
    if (e.key === "2") {
      onEvent({ button_id: "CAMERA", action: "CLICK", effect: "toggle_camera" });
    }
    if (e.key === "4") {
      onEvent({ button_id: "DISPLAY", action: "CLICK", effect: "toggle_dim" });
    }
    if (e.key === "s" || e.key === "S") {
      onEvent({
        button_id: "DISPLAY",
        action: "LONG_PRESS",
        effect: "toggle_sleep",
      });
    }
  };
  window.addEventListener("keydown", onKeyDown);
  return () => window.removeEventListener("keydown", onKeyDown);
}
