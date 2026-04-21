# Smart Mirror Control Contract v2

This document defines the unified REST + WebSocket contracts used by:

- `Smart-Mirror/ui` (mirror display app)
- `Smart-Mirror-App` (mobile companion app)
- `backend` FastAPI services

## WebSocket Envelope

All v2 control messages use a shared envelope:

```json
{
  "type": "EVENT_NAME",
  "version": 2,
  "sessionId": "optional-session-id",
  "timestamp": "2026-04-06T15:00:00.000Z",
  "payload": {}
}
```

The button channel is a lighter event stream and emits plain button payload objects instead of the v2 control envelope.

### Supported event types

- `WIDGETS_SYNC`
- `WIDGETS_SYNC_APPLIED`
- `WIDGETS_SYNC_ERROR`
- `button`
- `CAMERA_COUNTDOWN_STARTED`
- `CAMERA_COUNTDOWN_TICK`
- `CAMERA_CAPTURED`
- `CAMERA_ERROR`
- `WARDROBE_UPDATED`
- `TRYON_RESULT` with payload `{ "generation_id": string, "image_url": string }`

Legacy `SYNC_STATE` remains supported for backward compatibility.

## REST Endpoints

### Widgets

- `GET /api/widgets/`
- `PUT /api/widgets/`
- `GET /api/widgets/revision`
- `GET /api/widgets/gmail`
- `GET /api/widgets/calendar`

### Mirror profile session

- `POST /api/mirror/register`
- `GET /api/mirror/sync`
- `GET /api/profile/`
- `POST /api/profile/enroll`
- `POST /api/profile/activate`
- `DELETE /api/profile/{user_id}`

### OAuth provider management

- `GET /api/oauth/providers?hardware_id=...&user_id=...`
- `POST /api/oauth/providers/token`
- `DELETE /api/oauth/providers/{provider}?hardware_id=...&user_id=...`
- `POST /api/auth/login/google?hardware_id=...&user_id=...`

Google is the only supported OAuth provider in the current contract.

### Camera

- `GET /api/camera/status`
- `GET /api/camera/live` for MJPEG live view
- `GET /api/camera/stream.mjpg` alternate MJPEG path
- `POST /api/camera/capture`
  - body: `{ "countdown_seconds": number, "source": string, "session_id"?: string }`

### Clothing (wardrobe + Cloudinary + D1 sync)

- `GET /api/clothing/?include_images=true|false`
- `POST /api/clothing/`
- `POST /api/clothing/{item_id}/images`
- `DELETE /api/clothing/{item_id}`

### Try-on

- `POST /api/tryon/person-image`
- `GET /api/tryon/person-image/latest`
- `GET /api/tryon/person-image/{id}`
- `POST /api/tryon/outfit-generate`

## Button input channel

`GET /ws/buttons` broadcasts GPIO and simulated button actions using a semantic contract the UI can interpret by current screen and state.

Example frame:

```json
{
  "type": "button",
  "button_id": "LAYOUT",
  "action": "LONG_PRESS",
  "effect": "open_profile_menu",
  "semantic_action": "profile_menu_open",
  "semantic_group": "profile",
  "semantic_actions": ["profile_menu_open", "menu_open"],
  "ts": "2026-04-21T15:00:00.000000"
}
```

Semantic actions currently used by the mirror UI:

- `menu_open`
- `menu_close`
- `menu_back`
- `menu_up`
- `menu_down`
- `menu_select`
- `profile_menu_open`
- `display_toggle_dim`
- `display_toggle_sleep`
- `capture_photo`
- `dismiss_tryon`
- `cycle_layout`

For development without physical buttons, `POST /api/dev/buttons?button_id=...&action=...` injects the same semantics when `ENABLE_DEV_ENDPOINTS=true`.

## Camera action flow

1. Mobile app calls `POST /api/camera/capture`.
2. Backend emits `CAMERA_COUNTDOWN_STARTED`.
3. Backend emits `CAMERA_COUNTDOWN_TICK` every second.
4. Backend emits `CAMERA_CAPTURED` or `CAMERA_ERROR`.
5. Mirror UI and mobile companion react to the same event stream.
