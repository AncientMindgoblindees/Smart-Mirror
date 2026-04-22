# Validation Checklist

## Contract checks

- `GET /api/widgets/` and `PUT /api/widgets/` still work with existing payload shape.
- `/ws/control` accepts legacy `SYNC_STATE` and v2 `WIDGETS_SYNC`.
- Camera endpoints return expected responses:
  - `GET /api/camera/status`
  - `GET /api/camera/live` (MJPEG live view)
  - `POST /api/camera/capture`
- Wardrobe endpoints function end-to-end:
  - `GET /api/clothing/?include_images=true`
  - `POST /api/clothing/`
  - `DELETE /api/clothing/{item_id}`
- Identity + auth endpoints:
  - `POST /api/auth/login/google?hardware_id=...&user_id=...&intent=create_account`
  - `GET /api/auth/login/google/status?hardware_id=...&user_id=...`
  - `GET /api/oauth/google/start?hardware_id=...&user_id=...&source=qr&intent=create_account`

## End-to-end scenarios

1. Mobile edits widget layout and mirror reflects updated placement.
2. Mobile uploads wardrobe item, item appears in grid, and delete removes it.
3. Mobile presses capture:
   - mirror opens camera UI,
   - countdown displays,
   - completion event is received by both clients.
4. Mirror startup identity flow:
   - mirror shows identity chooser on boot,
   - user can select existing profile or `Create Account`,
   - `Create Account` shows QR, completes Google sign-in, redirects phone to companion URL,
   - mirror and companion both resolve the same active user context.

## Mobile UX checks

- Portrait mode (narrow width) supports all primary actions.
- Tabs are reachable and visible above fold.
- Connection settings persist after browser refresh.
