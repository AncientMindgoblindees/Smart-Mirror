# External Integration Hooks and APIs

This document defines the UI contract for future external services (camera stack, remote controls, cloud integrations, and mobile clients).

## Frontend hook events

The UI now exposes internal hook names in `ui/js/services/externalHooks.js`.

- `camera_mode_changed`
  - Fired when the mirror enters/exits camera mode.
  - Payload: `{ mode: "camera" | "dashboard", source_mode?: "local" | "stream" }`
- `display_mode_changed`
  - Fired when display mode changes.
  - Payload: `{ mode: "normal" | "dim" | "sleep" }`
- `layout_changed`
  - Fired when layout index changes.
  - Payload: `{ index: number }`
- `widgets_changed`
  - Fired when widget enable/disable state changes.
  - Payload: `{ widgets: Array<{ widget_id: string, enabled: boolean }> }`
- `widget_updated`
  - Fired whenever a widget refresh cycle runs.
  - Payload: `{ widget_id: string, ts: string }`

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
