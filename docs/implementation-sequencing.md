# Implementation Sequencing

## Backend migration path from legacy `SYNC_STATE`

1. Keep `SYNC_STATE` accepted on `/ws/control` for existing clients.
2. Introduce v2 envelope (`WIDGETS_SYNC`, camera and wardrobe events).
3. Mirror and companion clients emit v2 envelopes.
4. Remove legacy-only message assumptions once all clients are migrated.

## Companion frontend module split

Implemented structure:

- `src/shared/ws/contracts.ts`: shared WS envelope builders.
- `src/features/camera/cameraApi.ts`: camera trigger API.
- `src/features/wardrobe/wardrobeApi.ts`: wardrobe list/upload/delete API.
- `src/App.tsx`: orchestrates layout editing and tabbed UX surfaces.

Next iteration:

- Move layout state/sync from `App.tsx` into `src/features/layout/*`.
- Move connection/WS lifecycle into `src/features/connection/*`.
- Add dedicated try-on flow module under `src/features/wardrobe/*`.

## Mirror UI integration

- Subscribe to `/ws/control` camera events via `useControlEvents`.
- Open `CameraOverlay` automatically during countdown events.
- Keep existing `/ws/buttons` flow for hardware button effects.
