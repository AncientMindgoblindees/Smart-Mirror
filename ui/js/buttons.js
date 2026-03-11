const WS_PATH = (location.protocol === "https:" ? "wss://" : "ws://") +
  location.host +
  "/ws/buttons";

let socket = null;
let handler = null;
let reconnectTimeout = null;
let stopped = false;
let _keydownHandler = null;

function connect() {
  if (stopped) return;
  try {
    socket = new WebSocket(WS_PATH);
  } catch (e) {
    // Silently ignore; UI should still work without buttons.
    return;
  }

  socket.onopen = () => {
    // Connected; nothing else to do yet.
  };

  socket.onmessage = (event) => {
    if (!handler) return;
    try {
      const data = JSON.parse(event.data);
      if (data.type === "button") {
        handler({
          button_id: data.button_id,
          action: data.action,
          effect: data.effect,
        });
      }
    } catch {
      // Ignore malformed messages.
    }
  };

  socket.onclose = () => {
    socket = null;
    if (!stopped && reconnectTimeout == null) {
      reconnectTimeout = setTimeout(() => {
        reconnectTimeout = null;
        connect();
      }, 2000);
    }
  };

  socket.onerror = () => {
    // Let onclose handle reconnect; keep UI stable.
  };
}

export function startButtonListener(onEvent) {
  stopped = false;
  handler = onEvent;
  if (!socket) {
    connect();
  }

  // Remove any previously registered keydown handler before adding a new one.
  if (_keydownHandler) {
    window.removeEventListener("keydown", _keydownHandler);
  }

  // Optional: keyboard shortcuts for local dev (no GPIO).
  _keydownHandler = (e) => {
    if (!handler) return;
    if (e.key === "1") {
      handler({ button_id: "LAYOUT", action: "CLICK", effect: "cycle_layout" });
    }
    if (e.key === "4") {
      handler({ button_id: "DISPLAY", action: "CLICK", effect: "toggle_dim" });
    }
    if (e.key === "s") {
      handler({
        button_id: "DISPLAY",
        action: "LONG_PRESS",
        effect: "toggle_sleep",
      });
    }
  };
  window.addEventListener("keydown", _keydownHandler);
}

export function stopButtonListener() {
  stopped = true;
  handler = null;
  if (reconnectTimeout != null) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
  if (_keydownHandler) {
    window.removeEventListener("keydown", _keydownHandler);
    _keydownHandler = null;
  }
  if (socket) {
    socket.close();
    socket = null;
  }
}

