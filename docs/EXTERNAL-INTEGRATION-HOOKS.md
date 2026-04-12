# External Integration Hooks and APIs

This document defines the UI contract for future external services (camera stack, remote controls, cloud integrations, and mobile clients).

> **Note:** The mirror UI is now **React + TypeScript** (`ui/src/`, built to `ui/dist/`). References to `ui/js/services/externalHooks.js` and `layoutAdjustmentsProvider.js` describe the **legacy** vanilla ES-module UI. Re-implement equivalent hooks in React if you still need these events.

## Frontend hook events

The legacy UI exposed internal hook names in `ui/js/services/externalHooks.js` (removed).

- `camera_mode_changed`
  - Fired when the mirror enters/exits camera mode.
  - Payload: `{ mode: "camera" | "dashboard", source_mode?: "local" | "stream" }`
- `display_mode_changed`
  - Fired when display mode changes.
  - Payload: `{ mode: "normal" | "dim" | "sleep" }`
- `layout_changed`
  - Fired when layout index changes.
  - Payload: `{ index: number }`
- `orientation_changed`
  - Fired when viewport orientation changes.
  - Payload: `{ orientation: "vertical" | "horizontal", ts: string }`
- `widgets_changed`
  - Fired when widget enable/disable state changes.
  - Payload: `{ widgets: Array<{ widget_id: string, enabled: boolean }> }`
- `widget_updated`
  - Fired whenever a widget refresh cycle runs.
  - Payload: `{ widget_id: string, ts: string }`
- `widget_transform_changed`
  - Fired after freeform drag/resize persistence in layout mode `0`.
  - Payload: `{ widget_id: string, freeform_x: number, freeform_y: number, freeform_width: number, freeform_height: number, ts: string }`

## Layout adjustment provider contract

The legacy UI supported a pluggable layout adapter in `ui/js/services/layoutAdjustmentsProvider.js` (removed).
By default, it stores layout updates in local storage, but an external service can override behavior without changing core rendering logic.

Provider methods:

- `hydrateWidgetConfigs(configs)`
  - Optional bootstrap override before initial render.
  - Return adjusted widget configs (sync or async).
- `persistWidgetLayouts(configs)`
  - Called when widget enable/disable or layout updates are persisted.
- `onWidgetTransformChanged(payload)`
  - Called when a widget freeform move/resize is finalized.
- `onOrientationChanged(payload)`
  - Called when viewport orientation changes.

Example wiring:

```js
import { setLayoutAdjustmentProvider } from "./services/layoutAdjustmentsProvider.js";

setLayoutAdjustmentProvider({
  async hydrateWidgetConfigs(configs) {
    const remote = await fetch("/api/layouts/current").then((r) => r.json());
    return configs.map((cfg) => {
      const hit = remote.widgets.find((w) => w.widget_id === cfg.widget_id);
      return hit ? { ...cfg, ...hit } : cfg;
    });
  },
  async persistWidgetLayouts(configs) {
    await fetch("/api/layouts/current", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ widgets: configs }),
    });
  },
  async onWidgetTransformChanged(payload) {
    await fetch("/api/layouts/current/widget-transform", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  },
});
```

## External API endpoints expected by UI

The UI is ready to consume the following backend endpoints:

- `GET /api/camera/feed`
  - Returns preferred camera source.
  - Example:
    ```json
    { "mode": "stream", "stream_url": "http://pi.local:8080/stream.mjpg" }
    ```
  - Fallback behavior: if unavailable, UI uses `navigator.mediaDevices.getUserMedia`.

- `POST /api/integrations/hooks/events`
  - Receives mirror lifecycle events for external observability/integrations.
  - Example request body:
    ```json
    {
      "event_name": "layout_changed",
      "payload": { "index": 2 },
      "source": "mirror-ui",
      "ts": "2026-03-23T12:00:00.000Z"
    }
    ```

- `GET /api/integrations/hooks`
  - Returns registered external integrations and desired subscriptions.
  - Intended for future dynamic hook routing.

## Recommended future extensions

- Camera controls:
  - `POST /api/camera/capture`
  - `POST /api/camera/focus`
  - `POST /api/camera/exposure`
- Widget catalog and dynamic widget loading:
  - `GET /api/widgets/catalog`
  - `POST /api/widgets/install`
- Layout profile management:
  - `GET /api/layouts`
  - `PUT /api/layouts/{layout_id}`
- External automation:
  - `POST /api/automation/trigger`
  - `GET /api/automation/status`

## Notes

- All hooks are best-effort and non-blocking by design to avoid UI freezes.
- Integration failures must not disrupt local rendering or camera mode transitions.
