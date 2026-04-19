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
- `TRYON_RESULT` — payload: `{ "generation_id": string, "image_url": string }` (mirror + companion)

Legacy `SYNC_STATE` remains supported for backward compatibility.

## REST Endpoints

### Widgets

- `GET /api/widgets/`
- `PUT /api/widgets/`
- `GET /api/widgets/revision`

### Camera

- `GET /api/camera/status`
- `GET /api/camera/stream.mjpg` — MJPEG multipart stream for mirror `<img>` live view
- `POST /api/camera/capture`
  - body: `{ "countdown_seconds": number, "source": string, "session_id"?: string }`

### Clothing (wardrobe + Cloudinary + D1 sync)

- `GET /api/clothing/?include_images=true|false` — list items; when `include_images=true`, each item includes `images[]` (Cloudinary URLs).
- `POST /api/clothing/` — JSON body: `name`, `category`, optional `color`, `season`, `notes`
- `POST /api/clothing/{item_id}/images` — multipart file upload (stores Cloudinary metadata in SQLite / D1)
- `DELETE /api/clothing/{item_id}`

### Try-on (person image + Leonardo)

- `POST /api/tryon/person-image` — multipart upload; file saved under `data/person_images/` on the mirror host
- `GET /api/tryon/person-image/latest` — binary file stream of the newest person image
- `GET /api/tryon/person-image/{id}` — binary file stream by row id
- `POST /api/tryon/outfit-generate` — JSON `{ "clothing_image_ids": number[], "prompt"?: string }`; calls Leonardo, then broadcasts `TRYON_RESULT`

## Camera action flow

1. Mobile app calls `POST /api/camera/capture`.
2. Backend emits `CAMERA_COUNTDOWN_STARTED`.
3. Backend emits `CAMERA_COUNTDOWN_TICK` every second.
4. Backend emits `CAMERA_CAPTURED` or `CAMERA_ERROR`.
5. Mirror UI and mobile companion react to the same event stream.
