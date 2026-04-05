# Mirror sync protocol (v1)

Shared contract between the config UI, the FastAPI control WebSocket (`/ws/control`), and the mirror browser UI.

## Endpoints

- **WebSocket:** `ws(s)://<host>/ws/control`
- **Mirror UI:** receives pushed `MIRROR_STATE` after each successful `SYNC_STATE`.

## Message: `SYNC_STATE` (config → server)

Sent as JSON. The server validates with Pydantic (`backend/schemas/mirror_sync_state.py`) and persists widget rows. Unknown top-level keys are ignored; each widget object ignores unknown keys.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `type` | string | yes | Must be `SYNC_STATE` (case-insensitive on wire; normalized in handler). |
| `widgets` | array | yes | May be empty. Each item describes one widget and its layout. |
| `action` | string | no | Opaque hint for clients (e.g. `save`). |
| `meta` | object | no | Opaque metadata. |
| `protocol_version` | integer | no | Reserved for future breaking changes. |

### Widget object (`widgets[]`)

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Preferred stable id (mirrored as `widget_id` in DB when present). |
| `widget_id` | string | Alternative to `id`. |
| `name` | string | Display name. |
| `type` | string | Widget type key. |
| `x`, `y`, `width`, `height` | number | Layout in **percent** of the 9:16 canvas (0–100 typical). Must be finite; `width`/`height` > 0 when present. |
| `config` | object | Widget-specific options (merged into mirror `options`). |

## Message: `MIRROR_STATE` (server → mirror UI)

Broadcast to all control WebSocket clients after a successful `SYNC_STATE`:

```json
{
  "type": "MIRROR_STATE",
  "state": {
    "widgets": [ ... same shape as incoming widgets ... ],
    "action": "<optional echo of SYNC_STATE.action>",
    "meta": { }
  }
}
```

The mirror UI maps this to local `widgetConfigs` with `freeform_mode: "percent"`.

## Message: `ERROR`

Invalid `SYNC_STATE` payloads receive:

```json
{
  "type": "ERROR",
  "message": "Invalid SYNC_STATE payload",
  "detail": [ ... Pydantic error objects ... ]
}
```

## JSON Schema

Machine-readable schema: [`schemas/sync-state.v1.json`](../schemas/sync-state.v1.json).
