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

## 2026-04-21 - Validation + sync audit kickoff

- Action: Began plan execution for validation flow, D1 sync acceptance audit, and architecture flowchart packaging.
- Commands:
  - `graphify update .` (failed: command not installed in this shell environment)
  - `npm --prefix ui run build` (pass)
  - `npm --prefix ui run lint` (pass)
  - `npm --prefix ui run test` (pass, 3 files / 9 tests)
  - `python -m uvicorn backend.main:app --host 127.0.0.1 --port 8002` (started for smoke checks)
  - HTTP/WebSocket smoke script against `/api/health`, `/api/health/d1`, `/api/widgets/`, `/ws/control`, `/ws/buttons` (all connected/passed)
- Key results:
  - Validation command baseline is currently healthy for UI build/lint/tests.
  - Runtime backend smoke checks are healthy for core HTTP + WebSocket endpoints.
  - D1 sync loop logs immediately show table acceptance mismatch for `mirrors` and `user_profiles` (`INVALID_TABLE`) while worker health endpoint remains reachable.

## 2026-04-21 - Validation/sync reports and abstract flowchart asset

- Action: Produced validation and D1 acceptance audit documents, plus a presentation-ready abstract JPG flowchart and presenter notes.
- Artifacts created:
  - `docs/validation-audit-2026-04-21.md`
  - `docs/sync-d1-acceptance-audit-2026-04-21.md`
  - `docs/assets/smart-mirror-abstract-flowchart.jpg`
  - `docs/flowchart-presenter-notes-2026-04-21.md`
- Commands:
  - Generated JPG with Pillow via Python script (saved in `docs/assets/`).
- Key results:
  - Audit docs now include pass/fail evidence, checklist drift, D1 mismatch matrix, and new-table onboarding checklist.
  - Presentation artifact is abstract, layered, and stakeholder-friendly.

## 2026-04-21 - Final package assembly

- Action: Added a package index file to bundle all validation/sync deliverables and executive findings.
- Artifact:
  - `docs/validation-sync-package-2026-04-21.md`
- Key result:
  - Single handoff document now points directly to both audits and the presentation JPG asset.

## 2026-04-21 - Flowchart overlap fix

- Action: Regenerated `docs/assets/smart-mirror-abstract-flowchart.jpg` to avoid connector-label overlap.
- Change detail:
  - Moved all cross-layer flow labels below connector arrows.
  - Kept abstract layered structure intact (Device, Backend, Companion, Cloud).

## 2026-04-21 - Identity startup + Google create-account flow

- Action: Implemented mirror startup identity chooser with explicit `Create Account` flow, backend OAuth create-account intent handling, companion Google auth gate, and companion identity-context sync wiring.
- Smart-Mirror changes:
  - `ui/src/app/MirrorApp.tsx`: identity list now includes `Create Account`; create flow initiates Google login with `intent=create_account`; startup identity messaging updated.
  - `ui/src/features/auth/useAuthState.ts`, `ui/src/app/hooks/useAuthActions.ts`, `ui/src/api/mirrorApi.ts`, `ui/src/api/backendTypes.ts`: auth APIs now support login `intent` and explicit target user id.
  - `backend/api/auth.py`: login start accepts `intent` and forwards it to OAuth start URL/state.
  - `backend/api/oauth_web.py`: OAuth state tracks `intent`; `create_account` callback enrolls+activates profile and redirects to companion URL with `mirror_hardware_id` and `mirror_user_id`.
  - `backend/services/auth_manager.py`, `backend/schemas/auth.py`, `backend/services/providers/google_provider.py`: pending login tracks intent, response schemas include intent/target user id, and Google web scopes include `openid email profile`.
- Smart-Mirror-App changes:
  - `src/App.tsx`: added Google auth gate (`signInWithPopup`), sign-out, redirect query hydration for mirror identity context, settings fields for mirror hardware/user ids.
  - `src/lib/connectionConfig.ts`, `src/api/httpClient.ts`, `src/lib/mirrorApi.ts`: persisted identity context, automatic identity headers, auth routes append required `hardware_id/user_id`, WS URL scoped with query params.
- Docs updated:
  - `docs/control-contract.v2.md`
  - `docs/validation-checklist.md`
- Commands:
  - `python -m compileall backend/api/auth.py backend/api/oauth_web.py backend/services/auth_manager.py backend/services/providers/google_provider.py backend/schemas/auth.py` (pass)
  - `npm --prefix ui run build` (pass after one TS intent narrowing fix in `MirrorApp.tsx`)
  - `npm run build` in `Smart-Mirror-App` (pass; existing CSS import warning unchanged)
