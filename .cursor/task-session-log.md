# Smart Mirror — agent task log

## 2025-03-24 — UI file interconnection diagram

- **Action**: Mapped `ui/` JS/CSS/HTML and links to `backend/main.py` serving `/ui` and `/api`.
- **Commands**: Glob/semantic search + read `index.html`, `app.js`, `layout.js`, `api.js`, `widgets/base.js`, grep imports under `ui/js`.
- **Result**: Delivered Mermaid diagram + table: `app.js` as hub; widgets register via `base.js`; `layoutAdjustmentsProvider` → `localMirrorConfig`; `api.js` → FastAPI; `buttons.js` not imported by `app.js` (WebSocket path exists in backend).
- **Decisions**: Diagram treats `clock`/`weather`/`calendar` as side-effect imports that register with `base.js` before `mountWidget` runs.

## 2025-03-24 — Saved UI architecture diagram

- **Action**: Wrote `docs/ui-architecture.md` with Mermaid diagram, dependency table, and backend/UI notes.
- **Commands**: None (file write only).

## 2025-03-24 — System architecture report

- **Action**: Added `docs/system-architecture-report.md` (stack, APIs, WebSocket, CORS, env vars, auth guidance, gaps: camera/integrations not mounted in `main.py`, `buttons.js` vs `localInput.js`).
- **Commands**: Read `backend/main.py`, all `backend/api/*`, services, models, `ui/js/api.js`, `buttons.js`, `config.py`.
- **Fix**: `widget_service.replace_widgets` — initialize `seen_ids` and add `obj.id` each iteration so `PUT /api/widgets/` does not raise `NameError`.

## 2026-04-02 — Keyboard + WebSocket mirror controls

- **Action**: Added `ui/src/hooks/useMirrorInput.ts` (keys **d** dev panel, **1** layout, **2** dim, **3** sleep; wake from sleep on any key; WebSocket `/ws/buttons` for `cycle_layout`, `toggle_dim`, `toggle_sleep`). Updated `App.tsx` (sleep overlay, `showDevPanel` + `localStorage`), `ToolsPanel` (dim + sleep buttons, shortcut hint), CSS.
- **Commands**: `cd ui && npm install && npm run build` (success).
- **Decisions**: Dim and sleep separated; dim disabled visually when sleep is on; tools panel visibility persisted under `mirror_show_dev_panel`.


## 2026-04-06 — Mirror aesthetic + peripheral plan kickoff

- **Action**: Switched to current modular React structure (`ui/src/app`, `ui/src/features/*`) and mapped concrete files for theme tokens, widget registry, persistence transforms, and backend defaults.
- **Commands**: `ls`; read `ui/src/index.css`, `ui/src/styles/tokens.css`, `ui/src/app/MirrorApp.tsx`, `ui/src/features/widgets/{constants,registry,types,useWidgetPersistence}.ts*`, `ui/src/api/transforms.ts`, `backend/services/widget_service.py`, `ui/src/hooks/useMirrorInput.ts`.
- **Result**: Confirmed implementation targets differ from older flat paths; identified existing keyboard mapping gap (`1` cycle layout missing) and current freeform defaults to update.
- **Decisions**: Implement plan directly in modular feature files; preserve persisted placement precedence while updating seed/default layouts.


## 2026-04-06 — Mirror aesthetic + peripheral implementation

- **Action**: Implemented mirror theme tokens (pure black + glassmorphism), peripheral default layout, layout cycling (keyboard `1` + tools button + WS `cycle_layout`), and scaffold widgets `news` + `virtual_try_on` with future integration entrypoints.
- **Commands**: `npm --prefix /workspace/ui install && npm --prefix /workspace/ui run build` (success); `python3 -m pip install -r /workspace/backend/requirements.txt`; FastAPI `TestClient` checks for `/ui/`, `/api/health`, `/api/widgets/` GET/PUT (all 200).
- **Key Results**: UI build passes; keyboard mapping now includes `1`; tools panel includes layout cycle + mode label; transforms/backend seed include peripheral defaults and preserve persisted layouts.
- **Note**: Validation used existing DB rows (`clock`, `sticky_note`, `weather`, `calendar`) so seeded defaults apply only on empty DB as designed.

## 2026-04-17 — Runtime debug kickoff (SQLAlchemy + camera)

- **Action**: Loaded required process skills (`using-superpowers`, `systematic-debugging`) and located task logging files.
- **Commands**: Read skill files; searched for running log files and bug-related code paths with ripgrep.
- **Result**: Identified likely hotspots: `backend/database/session.py`, widget/sync services, and camera flow files (`backend/api/camera.py`, `backend/services/camera_service.py`, `backend/services/pi_camera.py`, `ui/src/features/camera/useCameraStream.ts`).
- **Decision**: Proceed with runtime instrumentation first (no speculative fix) per debug mode.

## 2026-04-17 — Instrumentation added for evidence collection

- **Action**: Added NDJSON debug instrumentation for SQL widget writes and camera capture flow.
- **Commands**: Edited `backend/api/widgets.py`, `backend/services/widget_service.py`, `backend/services/camera_service.py`, `backend/services/pi_camera.py`, and `ui/src/api/mirrorApi.ts`; added helper `backend/services/debug_log.py`.
- **Result**: Logs now capture request entry, DB path/permission state, commit success/failure, PiCamera import/init failures, capture start/failure, and frontend capture trigger payload.
- **Errors + Handling**: Attempted to clear `debug-90a4c0.log` via delete tool; file did not exist yet (expected clean baseline).
- **Verification**: Ran lint diagnostics on edited files; no new linter errors.

## 2026-04-17 — Camera runtime fix from confirmed hypotheses

- **Action**: Implemented evidence-based camera fallback in `backend/services/pi_camera.py`.
- **Reasoning**: User-reported hypothesis hits (`H4`, `H5`) indicate backend camera failure at Picamera2 import/init/capture layers while Pi CLI camera tooling works.
- **Change**: If Picamera2 import/init fails, backend now falls back to `rpicam-still` for both full captures and preview frames; retains existing debug logs and adds post-fix fallback usage logging.
- **Verification**: Lint check on edited file passed.

## 2026-04-17 — SQL readonly path instrumentation (D1 sync)

- **Action**: Added new debug instrumentation in `backend/services/d1_sync.py`.
- **Why**: No `H1-H3` logs appeared, indicating the readonly write likely occurs outside `/api/widgets` in background sync writes.
- **Coverage**:
  - `H7`: dirty row collection before push
  - `H8`: commit of local `synced_at` updates after push acceptance
  - `H9`: commit of merged remote rows during pull
- **Verification**: Lint diagnostics clean for modified file.

## 2026-04-17 — Follow-up from H7 and camera busy logs

- **Runtime Evidence Received**:
  - User observed `H7` for `widget_config`, `user_settings`, `clothing_item`, `clothing_image`.
  - Camera CLI error reports `failed to acquire camera ... pipeline handler in use by another process`.
- **Action (camera)**: Added interprocess lock around `rpicam-still` fallback in `backend/services/pi_camera.py` to serialize camera access across backend processes.
- **Action (SQL instrumentation)**: Added commit-failure instrumentation for `PATCH /api/widgets/item/{id}` (`H11`) and `DELETE /api/widgets/item/{id}` (`H12`) in `backend/api/widgets.py`.
- **Verification**: Lints clean for both touched files.

## 2026-04-17 — Camera busy holder instrumentation

- **Runtime Evidence**: Camera still fails with `Pipeline handler in use by another process` even after interprocess lock.
- **Action**: Added `H13` instrumentation in `backend/services/pi_camera.py` to capture device holder snapshots (`fuser -v /dev/video0,/dev/video1,/dev/media0,/dev/media2`) before fallback capture and again on failure.
- **Decision**: Treat `H7` as expected activity signal (D1 table scan), not root-cause proof for SQL failure by itself.
- **Verification**: Lint clean; debug log file still absent prior to next run.

## 2026-04-17 — Iteration: camera holder + sync progression

- **Runtime Evidence from user**: `H13` still reports holders on `/dev/media*`; `H7` continues for DB sync scans.
- **Action (camera)**: Updated `backend/services/pi_camera.py` to explicitly stop/close partially-initialized Picamera2 handles on init failure before switching to CLI fallback (`H14`), preventing backend self-lock leaks.
- **Action (sync evidence)**: Added `H15` logs in `backend/services/d1_sync.py` for early exits (`no dirty rows` and `no accepted ids`) to explain why later commit hypotheses may not fire.
- **Verification**: Lints clean; session debug file absent locally before rerun.

## 2026-04-17 — Applied fixes + removed instrumentation

- **Action**: Removed temporary debug instrumentation from widgets API/service, camera service, D1 sync service, and frontend camera API call; deleted `backend/services/debug_log.py`.
- **Camera fix kept**: `backend/services/pi_camera.py` now keeps interprocess lock + explicit cleanup of partial Picamera2 initialization and includes device-holder details directly in camera error text for diagnosis on Pi.
- **DB sync fix kept**: `backend/services/d1_sync.py` now treats SQLite readonly write failures during sync marker updates/merge as non-fatal (`rollback` + warning + continue), preventing sync loop crashes from repeated `readonly` writes.
- **Verification**: Lint diagnostics show no errors for all edited files.

## 2026-04-17 — D1 sync + PiCamera reliability implementation

- **Action**: Implemented plan items across backend sync, worker contracts, camera runtime handling, and UI camera error UX.
- **Changes**:
  - `backend/services/d1_sync.py`: merge persistence contract (`MergeOutcome`), prevent cursor advancement on failed merge, classify checkpoint write failures (missing table vs readonly vs other), protocol guard for missing `accepted_ids`, stronger readonly marker logging.
  - `deploy/worker/src/index.ts`: structured `error_code/table/op` responses, strict D1 success checks in `/sync/stats`, invalid timestamp handling in push conflict logic.
  - `backend/services/pi_camera.py`: expanded cross-process locking to all camera I/O paths, busy-aware bounded retries for CLI capture, richer holder snapshots (`fuser` + process command lines), Picamera2 capture/preview errors augmented with holder details.
  - `ui/src/features/camera/*`, `ui/src/app/MirrorApp.tsx`, `ui/src/app/hooks/useOverlayState.ts`: camera error state surfaced in overlay and adaptive preview polling backoff on repeated errors.
- **Commands**:
  - `python -m compileall backend/services/d1_sync.py backend/services/pi_camera.py backend/services/camera_service.py` (pass)
  - `npm --prefix ui run build` (pass)
  - `npm --prefix ui run test -- src/features/camera/cameraErrors.test.ts` (pass)
  - `npm exec wrangler deploy --dry-run` in `deploy/worker` (completed successfully and reported worker endpoint/version)
