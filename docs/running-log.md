# Running Log

## 2026-04-17 - Vite security hardening

- Reviewed Vite-related config and package versions in both `Smart-Mirror` and `Smart-Mirror-App`.
- Identified network-exposed dev server defaults and outdated Vite version in `Smart-Mirror-App`.
- Updated Vite versions:
  - `Smart-Mirror-App/package.json`: `vite` -> `^6.4.2` (dependencies + devDependencies)
  - `Smart-Mirror/ui/package.json`: `vite` -> `^8.0.8`
- Hardened local dev default in `Smart-Mirror-App/package.json`:
  - `dev` script changed from `vite --port=3000 --host=0.0.0.0` to `vite --port=3000`
- Refreshed lockfiles with `npm install` in:
  - `Smart-Mirror-App`
  - `Smart-Mirror/ui`
- Verified both projects still build:
  - `npm run build` passed in `Smart-Mirror-App` (Vite `6.4.2`)
  - `npm run build` passed in `Smart-Mirror/ui` (Vite `8.0.8`)

## 2026-04-21 - Smart-Mirror UI to config sync bridge

- Scoped work to minimal-touch `Smart-Mirror` UI changes and adapter-level changes in `smart-mirror-config`, using `docs/multi-profile-backend.md` as the contract.
- Updated `Smart-Mirror/ui/src/app/hooks/useMirrorSession.ts`:
  - Added `mirrorSyncSnapshot` state from `GET /api/mirror/sync`.
  - Exposed snapshot to downstream hooks/components for profile-scoped hydration.
- Updated `Smart-Mirror/ui/src/features/widgets/useWidgetPersistence.ts`:
  - Added optional `initialWidgets` + `initialUserSettings`.
  - Bootstraps from mirror sync snapshot before falling back to existing GET/poll/cache flow.
- Updated `Smart-Mirror/ui/src/app/MirrorApp.tsx`:
  - Passed `mirrorSyncSnapshot` payload into `MirrorDashboard`.
  - Wired `useWidgetPersistence` refresh key to `hardwareId:userId` so profile switch resets widget state safely.
- Updated `smart-mirror-config/src/lib/connectionConfig.ts`:
  - Added persisted identity context for `hardware_id`, `hardware_token`, and active `user_id`.
  - Added `buildScopedWsUrl()` to attach `hardware_id` and `user_id` to `/ws/control` query params.
- Updated `smart-mirror-config/src/api/httpClient.ts`:
  - Added automatic `X-Mirror-Hardware-Id`, `X-Mirror-Hardware-Token`, `X-Mirror-User-Id` headers on HTTP requests when configured.
- Updated `smart-mirror-config/src/App.tsx`:
  - Added Settings inputs for hardware id/token/active user id.
  - Persists identity fields and reconnects WS using scoped URL after save.
- Validation:
  - `npm run build` passed in `Smart-Mirror/ui`.
  - `npm run build` passed in `smart-mirror-config` (non-blocking CSS import ordering warning present from existing stylesheet layout).
