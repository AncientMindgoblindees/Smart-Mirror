# Validation Checklist

## Contract checks

- `GET /api/widgets/` and `PUT /api/widgets/` still work with existing payload shape.
- `/ws/control` accepts legacy `SYNC_STATE` and v2 `WIDGETS_SYNC`.
- Camera endpoints return expected responses:
  - `GET /api/camera/status`
  - `POST /api/camera/capture`
- Wardrobe endpoints function end-to-end:
  - `GET /api/wardrobe/items`
  - `POST /api/wardrobe/items`
  - `DELETE /api/wardrobe/items/{id}`

## End-to-end scenarios

1. Mobile edits widget layout and mirror reflects updated placement.
2. Mobile uploads wardrobe item, item appears in grid, and delete removes it.
3. Mobile presses capture:
   - mirror opens camera UI,
   - countdown displays,
   - completion event is received by both clients.

## Mobile UX checks

- Portrait mode (narrow width) supports all primary actions.
- Tabs are reachable and visible above fold.
- Connection settings persist after browser refresh.
