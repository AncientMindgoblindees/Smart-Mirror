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

## 2026-04-17 — Pi camera ownership remediation implementation

- **Action**: Implemented camera ownership/process remediation plan and extra UX fix to close camera overlay after capture errors.
- **Changes**:
  - `scripts/start-mirror-app.sh`: added single-instance backend startup lock via `flock`, atomic startup helper, stale PID cleanup under lock, and port-listener guard with diagnostics.
  - `scripts/stop-mirror-app.sh`: added graceful+bounded forced termination helper, optional cleanup of duplicate uvicorn instances on configured mirror port (`MIRROR_STOP_EXTRA_BACKENDS=1`), and post-stop listener diagnostics.
  - `backend/services/pi_camera.py`: compact machine-friendly holder sections (`holders_media`, `holders_backend`, `holders_other`), retained retries/locking, and completed camera teardown with `cam.close()` in `close()`.
  - `backend/api/camera.py`: structured `503` payload for preview failures with stable `code/message/detail`.
  - `ui/src/app/MirrorApp.tsx`: concise camera error summarization and logic to close overlay when capture-flow errors occur so UI returns to main mirror screen.
  - `README.md`: added Raspberry Pi camera ownership troubleshooting and single-process runtime guidance.
- **Commands**:
  - `bash -n scripts/start-mirror-app.sh; bash -n scripts/stop-mirror-app.sh` (pass)
  - `python -m compileall backend/services/pi_camera.py backend/api/camera.py backend/services/d1_sync.py` (pass)
  - `npm --prefix ui run build` (pass)
  - `npm exec wrangler deploy --dry-run` in `deploy/worker` (pass)

## 2026-04-17 — Follow-up fix for persistent Pi camera contention + readonly D1

- **Runtime Evidence**: User logs still show `/dev/media*` holders (`pipewire`/`wireplumber`) and many duplicate `uvicorn backend.main:app` processes, plus persistent readonly D1 behavior.
- **Action**:
  - Added backend process singleton lock at app startup via new `backend/services/runtime_singleton.py`, wired in `backend/main.py` startup/shutdown.
  - Updated `backend/services/d1_sync.py` to detect readonly local SQLite at startup and disable D1 sync loop (`LOCAL_DB_READONLY_AT_STARTUP`), and to disable sync for the process when readonly is encountered during marker/merge commits.
  - Updated `scripts/stop-mirror-app.sh` to stop duplicate backend instances by default (`MIRROR_STOP_EXTRA_BACKENDS=1` default).
  - Added explicit user-session media-service stop/start guidance in `README.md` for resolving PipeWire ownership conflicts.
- **Commands**:
  - `python -m compileall backend/main.py backend/services/runtime_singleton.py backend/services/d1_sync.py` (pass)
  - `bash -n scripts/start-mirror-app.sh; bash -n scripts/stop-mirror-app.sh` (pass)
  - `npm --prefix ui run build` (pass)

## 2026-04-17 — PipeWire auto-release camera recovery

- **Runtime Evidence**: After reboot, only one backend process remained, but camera still failed with `resource busy` while holders showed `pipewire` + `wireplumber` on `/dev/media*`.
- **Action**:
  - `backend/services/pi_camera.py`: added PipeWire-holder detection and optional automatic user-service stop (`systemctl --user stop pipewire pipewire-pulse wireplumber`) before retrying camera acquisition; error now includes `media_release=` outcome.
  - `scripts/start-mirror-app.sh`: added optional pre-flight auto-stop of PipeWire services (`MIRROR_CAMERA_AUTO_STOP_PIPEWIRE`, default `1`).
  - `README.md`: documented auto-stop toggle and behavior.
- **Commands**:
  - `python -m compileall backend/services/pi_camera.py` (pass)
  - `bash -n scripts/start-mirror-app.sh` (pass)

## 2026-04-19 — Accelerate latest photo propagation

- **Action**: Implemented UI and backend changes to reduce capture-to-visible delay for latest person photo propagation.
- **Code Changes**:
  - `C:/Users/tjmel/Downloads/smart-mirror-config/src/features/camera/cameraApi.ts`: reduced app-triggered capture countdown from 5s to 3s.
  - `C:/Users/tjmel/Downloads/smart-mirror-config/src/App.tsx`: on `CAMERA_CAPTURED`, now increments `personImageNonce` to auto-reload latest person image without manual refresh.
  - `backend/config.py`: added `PI_CAMERA_MAX_DIM` and `PI_CAMERA_JPEG_QUALITY` settings.
  - `backend/services/pi_camera.py`: added scaled capture dimensions, CLI JPEG quality flag, and latest-photo transport optimization (resize + JPEG recompress for `latest_person.jpg`).
  - `backend/api/tryon.py`: added `no-store/no-cache` headers on `/api/tryon/person-image/latest`.
  - `backend/requirements.txt`: added `Pillow` dependency for image optimization.
- **Commands**:
  - `npm run build` in `C:/Users/tjmel/Downloads/smart-mirror-config` (pass; existing CSS `@import` order warning only).
  - `python -m compileall backend/config.py backend/api/tryon.py backend/services/pi_camera.py` in `C:/Cursor_Projects/Smart-Mirror` (pass).
- **Verification**:
  - `ReadLints` on all edited files in both repos reported no lint errors.
- **Decision**:
  - Chose balanced defaults for speed/quality (`PI_CAMERA_MAX_DIM=1280`, `PI_CAMERA_JPEG_QUALITY=82`) to reduce payload size while keeping try-on quality acceptable.

## 2026-04-19 — Env example update for photo propagation tuning

- **Action**: Added new camera optimization environment variables to `.env.example` for discoverability and easy tuning.
- **Changes**:
  - Added `PI_CAMERA_MAX_DIM=1280` with comment clarifying long-edge resize behavior.
  - Added `PI_CAMERA_JPEG_QUALITY=82` with comment clarifying valid quality range.
- **Reasoning**: Keeps runtime defaults and documented sample env aligned after introducing balanced image transport optimization.

## 2026-04-19 — Camera loading gate before countdown

- **Action**: Updated capture flow so countdown starts only after camera preparation completes, with explicit loading UX in companion app.
- **Backend changes**:
  - `backend/services/pi_camera.py`: added `prepare_for_capture()` to warm camera readiness before countdown (Picamera2 init path or lightweight CLI warmup shot).
  - `backend/services/camera_service.py`: capture pipeline now broadcasts `CAMERA_LOADING_STARTED`, waits for `pi_camera.prepare_for_capture`, then broadcasts `CAMERA_LOADING_READY` before `CAMERA_COUNTDOWN_*` events.
- **UI changes**:
  - `C:/Users/tjmel/Downloads/smart-mirror-config/src/App.tsx`: added `cameraLoading` state; handles new loading events; shows `Camera Loading` indicator with spinning `Loader2`; disables capture button while loading/countdown; updates status copy.
  - Removed optimistic local countdown start on button click; countdown now strictly follows backend events.
- **Commands**:
  - `python -m compileall backend/services/camera_service.py backend/services/pi_camera.py` (pass)
  - `npm run build` in `C:/Users/tjmel/Downloads/smart-mirror-config` (pass; existing CSS `@import` order warning only)
- **Verification**:
  - `ReadLints` on edited backend and frontend files reported no lint errors.

## 2026-04-19 — Mirror-side continuous feed + app countdown 5s

- **Action**: Adjusted implementation to match intent split:
  - countdown control remains in companion app (`smart-mirror-config`)
  - continuous feed display remains on Smart Mirror UI (`ui`)
- **Changes**:
  - `C:/Users/tjmel/Downloads/smart-mirror-config/src/features/camera/cameraApi.ts`: set `countdown_seconds` to `5`.
  - `ui/src/hooks/controlEventProtocol.ts`: added parsing for `CAMERA_LOADING_STARTED` and `CAMERA_LOADING_READY`.
  - `ui/src/hooks/useControlEvents.ts`: added optional handlers for camera loading lifecycle events.
  - `ui/src/app/MirrorApp.tsx`: on `CAMERA_LOADING_STARTED`, opens camera overlay immediately (before countdown) so continuous preview is visible while user adjusts pose; keeps overlay until capture completes.
- **Commands**:
  - `npm --prefix ui run build` (pass)
  - `npm run build` in `C:/Users/tjmel/Downloads/smart-mirror-config` (pass; existing CSS `@import` order warning only)
- **Verification**:
  - `ReadLints` on all touched files reported no lint errors.

## 2026-04-19 — Mirror camera loading UX + live-feed reliability pass

- **Action**: Added explicit loading UX to mirror camera overlay and strengthened preview update behavior to address “no live feed” during capture flow.
- **Changes**:
  - `ui/src/app/hooks/useOverlayState.ts`: added `cameraLoading` overlay state.
  - `ui/src/app/MirrorApp.tsx`: wires `cameraLoading` through capture lifecycle events and into `CameraOverlay`; resets state on close/capture/error.
  - `ui/src/features/camera/CameraOverlay.tsx`: added loading prop and visible spinner status (`Camera Loading…`) while camera prepares; enables aggressive preview polling during loading/countdown.
  - `ui/src/features/camera/useCameraStream.ts`: accepts `aggressive` mode and uses faster fixed polling during active capture flow to recover from transient preview failures quickly.
  - `ui/src/features/camera/camera-overlay.css`: added spinner styling and loading badge visuals.
- **Commands**:
  - `npm --prefix ui run build` (pass)
- **Verification**:
  - `ReadLints` on all edited mirror UI files reported no errors.

## 2026-04-19 — Wider camera FOV framing

- **Action**: Increased effective field of view by switching capture and preview defaults to 4:3 framing (less vertical crop than prior 16:9 defaults).
- **Changes**:
  - `backend/config.py`: changed default `PI_CAMERA_CAPTURE_HEIGHT` from `1080` to `1440` (with `PI_CAMERA_CAPTURE_WIDTH=1920` this is 4:3).
  - `backend/services/pi_camera.py`: updated CLI warmup frame to `320x240` and live preview frame to `640x480` for matching 4:3 composition.
  - `.env.example`: documented new 4:3 default for `PI_CAMERA_CAPTURE_HEIGHT=1440`.
- **Commands**:
  - `python -m compileall backend/config.py backend/services/pi_camera.py` (pass)
- **Verification**:
  - `ReadLints` on edited files reported no lint errors.

## 2026-04-19 — Camera preview plan (live feed, loader, FOV)

- **Action**: Implemented attached camera review plan: Picamera2 live preview via `capture_request`, lores stream for `/preview.jpg`, UI loader behavior, and reduced perceived zoom.
- **Backend**:
  - `backend/config.py`: added `PI_CAMERA_PREVIEW_LORES_MAX` (default 640).
  - `backend/services/pi_camera.py`: still config tries `main` + `lores` (same aspect); preview uses `_picamera2_save_preview_jpeg` (`capture_request`, prefer `lores` then `main`); final still uses `_picamera2_save_main_jpeg`; `prepare_for_capture` discards one Picamera2 preview frame when using Picamera2.
- **UI**:
  - `ui/src/features/camera/camera-overlay.css`: `object-fit: contain` for full sensor frame in overlay.
  - `ui/src/features/camera/CameraOverlay.tsx`: `key={frameSrc}`, `onPreviewFrameLoaded`, hide boot spinner when countdown overlay is active.
  - `ui/src/app/MirrorApp.tsx`: do not clear `cameraLoading` on `CAMERA_LOADING_READY`; clear on first preview frame or countdown start; dev panel camera toggle sets loading when opening.
- **Docs**: `.env.example` documents `PI_CAMERA_PREVIEW_LORES_MAX`.
- **Commands**: `python -m compileall backend/config.py backend/services/pi_camera.py`; `npm --prefix ui run build` (pass).
- **Verification**: `ReadLints` on touched files reported no issues.

## 2026-04-19 — Portrait mirror-resolution camera framing

- **Action**: Shifted camera framing toward mirror-style vertical composition (portrait) instead of monitor-style landscape.
- **Changes**:
  - `backend/config.py`: changed camera defaults to portrait `PI_CAMERA_CAPTURE_WIDTH=1080`, `PI_CAMERA_CAPTURE_HEIGHT=1920`.
  - `backend/services/pi_camera.py`: updated CLI warmup and preview sizes to portrait-oriented `180x320` and `360x640`.
  - `ui/src/features/camera/camera-overlay.css`: camera viewport now fixed portrait (`aspect-ratio: 9/16`), centered within overlay, with `object-fit: cover` so framing feels mirror-native.
  - `.env.example`: documented portrait defaults for capture width/height.
- **Commands**:
  - `python -m compileall backend/config.py backend/services/pi_camera.py` (pass)
  - `npm --prefix ui run build` (pass)
- **Verification**:
  - `ReadLints` on all edited files reported no lint errors.

## 2026-04-19 — Camera overlay UX (boot + on-frame countdown)

- **Action**: Mirror capture overlay shows “Booting the camera” during boot; countdown is a bottom badge so the live preview stays visible; fixed stale `cameraCountdown` check in `onCameraError` via ref.
- **Changes**:
  - `ui/src/features/camera/CameraOverlay.tsx`: boot copy; countdown uses `camera-countdown-badge` (Photo in / value / sec) instead of full-bleed status overlay.
  - `ui/src/features/camera/camera-overlay.css`: styles for `.camera-countdown-badge`, label, value, unit (`pointer-events: none`, high-contrast numerals).
  - `ui/src/app/MirrorApp.tsx`: `cameraCountdownRef` synced each render; `onCameraError` uses `hadActiveCountdown` from ref before clearing state.
- **Commands**: `Set-Location ui; npm run build` (PowerShell; pass).
- **Verification**: `ReadLints` on touched TSX files — no issues; production build succeeded.

## 2026-04-19 — Camera boot dwell, live preview tuning, smaller viewport

- **Action**: Enforced minimum boot window before server countdown ticks; boot overlay stays above preview/countdown; faster preview polling during countdown; capped preview frame size; dev-panel camera uses same 2.5s boot dwell.
- **Changes**:
  - `backend/config.py`: `CAMERA_MIN_BOOT_BEFORE_COUNTDOWN_SEC` (default 2.5).
  - `backend/services/camera_service.py`: after `CAMERA_LOADING_READY`, sleep remaining time so elapsed since `CAMERA_LOADING_STARTED` is at least configured boot before `CAMERA_COUNTDOWN_STARTED`.
  - `.env.example`: documented `CAMERA_MIN_BOOT_BEFORE_COUNTDOWN_SEC`.
  - `ui/src/app/MirrorApp.tsx`: removed clearing boot on preview `onLoad`; companion boot ends on `CAMERA_COUNTDOWN_STARTED`; dev camera opens with 2.5s timer + cleanup on WS capture/error/close/unmount.
  - `ui/src/features/camera/CameraOverlay.tsx`: separate boot layer (`camera-status-boot`) vs “Starting camera…”; countdown badge only when `!loading`.
  - `ui/src/features/camera/camera-overlay.css`: boot dim layer `z-index: 4`; smaller `.camera-video-wrap` caps.
  - `ui/src/features/camera/useCameraStream.ts`: `turbo` option (200ms) when live countdown visible.
- **Commands**: `python -m compileall backend/config.py backend/services/camera_service.py` (pass); `npm run build` in `ui` (pass).
- **Verification**: `ReadLints` on edited TS — no issues.

## 2026-04-19 — Camera boot/preview reliability (status + WS)

- **Action**: Exposed `booting` on `GET /api/camera/status`; MirrorApp polls status every 400ms so boot + countdown stay in sync if `/ws/control` drops messages; WebSocket handler accepts Blob frames; boot label contrast + preview box sizing tweaks.
- **Changes**: `backend/schemas/camera.py`, `backend/services/camera_service.py`, `ui/src/app/MirrorApp.tsx`, `ui/src/hooks/useControlEvents.ts`, `ui/src/features/camera/camera-overlay.css`, `ui/src/api/backendTypes.ts`.
- **Commands**: `python -m compileall` (pass); `npm run build` in `ui` (pass).

## 2026-04-19 — Preview: sequential JPEG loads (fix blank live feed)

- **Action**: Replaced timer-only `src` updates (and per-tick `key` remount) with load-chained polling in `useCameraStream` so the next frame is requested only after `onLoad`/`onError`; raised preview error overlay z-index; `decoding="async"` + `referrerPolicy` on preview `<img>`.
- **Commands**: `npm run build` in `ui` (pass).
