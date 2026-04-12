# Smart Mirror Control Contract v2

This document defines the unified REST + WebSocket contracts used by:

- `Smart-Mirror/ui` (mirror display app)
- `Smart-Mirror-App` (mobile companion app)
- `backend` FastAPI services

## WebSocket Envelope

All v2 messages use a shared envelope:

```json
{
  "type": "EVENT_NAME",
  "version": 2,
  "sessionId": "optional-session-id",
  "timestamp": "2026-04-06T15:00:00.000Z",
  "payload": {}
}
```

### Supported event types

- `WIDGETS_SYNC`
- `WIDGETS_SYNC_APPLIED`
- `WIDGETS_SYNC_ERROR`
- `CAMERA_COUNTDOWN_STARTED`
- `CAMERA_COUNTDOWN_TICK`
- `CAMERA_CAPTURED`
- `CAMERA_ERROR`
- `WARDROBE_UPDATED`

Legacy `SYNC_STATE` remains supported for backward compatibility.

## REST Endpoints

### Widgets

- `GET /api/widgets/`
- `PUT /api/widgets/`
- `GET /api/widgets/revision`

### Camera

- `GET /api/camera/status`
- `POST /api/camera/capture`
  - body: `{ "countdown_seconds": number, "source": string, "session_id"?: string }`

### Wardrobe

- `GET /api/wardrobe/items?user_id=local-dev`
- `POST /api/wardrobe/items` (multipart form upload)
- `DELETE /api/wardrobe/items/{id}`
- `GET /api/wardrobe/files/{fileName}`
- `POST /api/wardrobe/virtual-try-on/preview` (stubbed integration contract)

## Camera action flow

1. Mobile app calls `POST /api/camera/capture`.
2. Backend emits `CAMERA_COUNTDOWN_STARTED`.
3. Backend emits `CAMERA_COUNTDOWN_TICK` every second.
4. Backend emits `CAMERA_CAPTURED` or `CAMERA_ERROR`.
5. Mirror UI and mobile companion react to the same event stream.
