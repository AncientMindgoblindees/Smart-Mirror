# Validation Audit - 2026-04-21

## Scope
- Validate the current Smart Mirror flow using the checklist in `docs/validation-checklist.md`.
- Verify executable health from UI build/lint/tests and backend HTTP/WebSocket smoke checks.
- Identify checklist drift against live API routes.

## Evidence Collected

### Build, lint, and tests
- `npm --prefix ui run build`: pass
- `npm --prefix ui run lint`: pass
- `npm --prefix ui run test`: pass (`3` files / `9` tests)

### Backend runtime smoke checks
- Started backend: `python -m uvicorn backend.main:app --host 127.0.0.1 --port 8002`
- HTTP smoke:
  - `GET /api/health` -> `200 {"status":"ok"}`
  - `GET /api/health/d1` -> `200` and worker reachable
  - `GET /api/widgets/` -> `200` with widget rows
- WebSocket smoke:
  - `ws://127.0.0.1:8002/ws/control` -> connected
  - `ws://127.0.0.1:8002/ws/buttons` -> connected

## Checklist Traceability

| Checklist Item | Implementation Anchor | Status |
|---|---|---|
| `GET/PUT /api/widgets/` still works | `backend/api/widgets.py`, `backend/main.py` router mount | Partial (GET runtime-verified; PUT not executed in this audit) |
| `/ws/control` accepts `SYNC_STATE` + `WIDGETS_SYNC` | `backend/api/events.py` (`ws_control`) + schema normalization | Partial (socket connectivity verified; protocol payload acceptance not replayed here) |
| Camera endpoints | `backend/api/camera.py` (`/status`, `/live`, `/capture`) | Not executed in this pass |
| Wardrobe endpoints | Checklist says `/api/wardrobe/items*` | Drift (actual route prefix is `/api/clothing/*`) |

## Contract Drift and Gaps
- **Route mismatch:** checklist wardrobe paths are stale (`/api/wardrobe/items*`), but backend routes are under `/api/clothing/*` in `backend/api/clothing.py`.
- **Coverage gap:** no backend automated tests found for API/WebSocket routes in this repo; validation is mostly manual/runtime smoke.
- **Scenario gap:** E2E checklist scenarios (mobile layout sync, wardrobe upload/delete, capture flow completion on both clients) were not automated and were not fully replayed in this run.

## Pass/Fail Summary
- **Passed**
  - UI build/lint/tests baseline
  - Backend startup and core endpoint/socket reachability
  - D1 worker reachability (`/api/health/d1`)
- **Needs follow-up**
  - Checklist route drift (`wardrobe` vs `clothing`)
  - Full payload-level `/ws/control` contract replay
  - Camera and full mobile E2E scenario replay

## High-Impact Fixes (Recommended)
1. Update `docs/validation-checklist.md` wardrobe section to `/api/clothing/*`.
2. Add backend integration tests for:
   - `/api/widgets` GET/PUT
   - `/ws/control` message acceptance for `SYNC_STATE` and `WIDGETS_SYNC`
   - `/api/camera/status`, `/api/camera/live`, `/api/camera/capture`
3. Add a simple CI workflow to run UI build/lint/test and backend smoke checks on each push.
