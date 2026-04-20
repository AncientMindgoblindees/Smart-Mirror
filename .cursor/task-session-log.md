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

## 2026-04-19 — MJPEG stream instead of polling /preview.jpg

- **Why**: Browser on the mirror cannot use `getUserMedia()` for the Pi camera; only the backend opens hardware. Discrete `/preview.jpg` requests were fragile. MJPEG is one long-lived HTTP response the browser decodes as a continuous `<img>` feed.
- **Changes**: `GET /api/camera/stream.mjpg` (`StreamingResponse`, `multipart/x-mixed-replace`); `CAMERA_MJPEG_MAX_FPS` in `backend/config.py` + `.env.example`; `ui/src/features/camera/useCameraStream.ts` points `<img>` at stream URL with retry rev; `CameraOverlay` no longer passes polling options; `/preview.jpg` kept for one-shot use.

## 2026-04-19 — Remove GET /api/camera/preview.jpg

- **Action**: Dropped the discrete preview route; live HTTP view is only `GET /api/camera/stream.mjpg`. `CameraCaptureState.read_mjpeg_frame` wraps the Pi JPEG grab used inside the MJPEG generator.
- **Docs**: `docs/control-contract.v2.md`, `docs/validation-checklist.md`; `.env.example` lores comment.
- **Commands**: `python -m compileall backend/api/camera.py backend/services/camera_service.py`; `npm run build` in `ui` (pass).

## 2026-04-19 — Camera 404 mitigation: /live + restore preview.jpg

- **Action**: Added `GET /api/camera/live` (same MJPEG as `stream.mjpg`, no dotted segment); restored `GET /api/camera/preview.jpg` single-frame; UI `<img>` uses `/api/camera/live`.
- **Reason**: Some setups 404’d after dropping `preview.jpg` only or blocking `.mjpg` paths; mirror UI now targets `/live` first.

## 2026-04-19 — Drop GET /preview.jpg again; live MJPEG + still only after countdown

- **Action**: Removed `GET /api/camera/preview.jpg`. Live view remains `GET /api/camera/live` (and `stream.mjpg`). Final person image still `pi_camera.capture_to` after countdown in `camera_service._run_capture` (unchanged).
- **Files**: `backend/api/camera.py`, `backend/services/camera_service.py` (docstring), `backend/config.py`, `.env.example`, `docs/control-contract.v2.md`, `docs/validation-checklist.md`.
- **Commands**: `python -m compileall backend/api/camera.py`; route list shows `/api/camera/status`, `/capture`, `/live`, `/stream.mjpg` only; `npm run build` in `ui` (pass).

## 2026-04-19 — OAuth credential placement guidance (Google TV/Web)

- **Action**: Verified where Google/Microsoft OAuth credentials are loaded and mapped setup docs for user guidance.
- **Commands**: Read `.env.example`, `ui/.env.example`, `docs/oauth-google-microsoft-setup.md`, and `backend/api/oauth_web.py`; ripgrep search for `GOOGLE_CLIENT_ID|GOOGLE_CLIENT_SECRET|MICROSOFT_CLIENT_ID|MICROSOFT_CLIENT_SECRET` in `backend/` and `ui/`.
- **Result**: Confirmed OAuth credentials are backend-only in repo-root `.env` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`); no UI env vars for these; `ui/.env.example` only has optional `VITE_BACKEND_ORIGIN`.
- **Decision**: Instruct user to use one Google client pair at a time in `.env` (Web client recommended first; swap to TV/Limited Input pair if QR/device flow fails).

## 2026-04-19 — Clarified Google web vs QR flow mapping

- **Action**: Verified current auth paths for companion direct sign-in vs on-screen QR sign-in.
- **Commands**: Read `backend/services/providers/google_provider.py`, `backend/api/oauth_web.py`, and `ui/src/features/auth/AuthQROverlay.tsx`.
- **Result**: Confirmed QR overlay uses Google Device Authorization Grant (`/device/code` + polling), while companion direct sign-in uses browser authorization-code callback flow (`/api/oauth/google/start` and `/callback`).
- **Decision**: Advise that Web and TV credentials target different flows; current single env pair cannot support both credential sets simultaneously without a code change.

## 2026-04-19 — Implement split Google OAuth credentials (web + TV)

- **Action**: Added dedicated Google credential support per flow with fallback compatibility.
- **Changes**:
  - `backend/services/providers/google_provider.py`: added `get_google_device_oauth_credentials()` and `get_google_web_oauth_credentials()`; device flow now prefers `GOOGLE_TV_CLIENT_*` and falls back to `GOOGLE_CLIENT_*`.
  - `backend/api/oauth_web.py`: Google browser flow now uses `GOOGLE_WEB_CLIENT_*` with fallback to `GOOGLE_CLIENT_*`; improved missing-config error detail.
  - `.env.example`: documented `GOOGLE_WEB_CLIENT_*` and `GOOGLE_TV_CLIENT_*` plus legacy fallback pair.
  - `docs/oauth-google-microsoft-setup.md`: updated setup guidance/checklist for split credential configuration.
- **Commands**:
  - `python -m compileall backend/services/providers/google_provider.py backend/api/oauth_web.py` (pass)
- **Verification**:
  - `ReadLints` on all touched files reported no lint errors.

## 2026-04-19 — UI camera capture live-feed regression fix (Smart-Mirror only)

- **Action**: Fixed mirror UI capture overlay state so live feed appears during capture-triggered flows (not companion app UI).
- **Root Cause**: In `ui/src/app/MirrorApp.tsx`, capture flow kept `cameraLoading` true until countdown events, and the overlay call site no longer consumed preview-frame load to clear that gate.
- **Changes**:
  - `onCameraLoadingReady` now clears `cameraLoading`.
  - `CameraOverlay` usage now passes `onPreviewFrameLoaded` callback to also clear `cameraLoading` when first frame arrives.
- **Commands**:
  - `npm run build` in `ui/` (pass)
- **Verification**:
  - `ReadLints` on `ui/src/app/MirrorApp.tsx` reported no lint errors.

## 2026-04-19 — Verification scan for stale preview.jpg callers

- **Action**: Audited Smart-Mirror UI/backend source for any remaining `preview.jpg` camera endpoint usage.
- **Commands**:
  - `rg "preview\\.jpg|/preview|camera/preview"` in repo root and companion app repo.
  - `rg "camera/live|stream\\.mjpg|camera/preview"` in `ui/`.
  - `rg "@router\\.get\\(\"/preview\\.jpg\"\\)|\"/preview\\.jpg\"|\"/live\"|\"/stream\\.mjpg\""` in `backend/`.
- **Result**: No source callers of `/api/camera/preview.jpg` found. Active paths are UI `GET /api/camera/live` and backend routes `/camera/live` and `/camera/stream.mjpg`. Remaining `preview.jpg` mentions are only historical notes in `.cursor/task-session-log.md`.

## 2026-04-19 — Pi startup reliability hardening (Chromium profile + password store)

- **Action**: Updated launcher/autostart defaults for reliable kiosk startup using persistent Chromium profile and basic password store.
- **Changes**:
  - `scripts/start-mirror-app.sh`:
    - Added `MIRROR_CHROMIUM_PASSWORD_STORE` (default `basic`).
    - Added `MIRROR_CHROMIUM_USER_DATA_DIR` (default `ROOT/data/chromium-profile`).
    - Ensures profile dir exists before launch.
    - Chromium flags now include `--user-data-dir`, `--password-store`, `--no-first-run`, and `--no-default-browser-check`.
  - `deploy/raspberry-pi/smart-mirror.desktop.template`:
    - `Exec=` now sets `MIRROR_CHROMIUM_PASSWORD_STORE=basic` and `MIRROR_CHROMIUM_USER_DATA_DIR=.../data/chromium-profile` via `env`.
    - Added `StartupNotify=false` and `X-GNOME-Autostart-enabled=true`.
  - `README.md`: documented new Chromium reliability env variables under Pi launcher/autostart section.
- **Commands**:
  - `bash -n scripts/start-mirror-app.sh` (pass)
  - `bash -n deploy/raspberry-pi/install-pi-launcher.sh` (pass)
- **Verification**:
  - `ReadLints` on changed files returned no diagnostics.

## 2026-04-19 — Hybrid shell flow: simple entry + restored reliability guards

- **Action**: Updated existing shell scripts to preserve user-requested simple launch style while restoring reliability protections.
- **Changes**:
  - `scripts/start-mirror-app.sh`:
    - Kept lockfile + cleanup-first startup pattern.
    - Restored backend port owner detection before backend launch.
    - Restored `uvicorn` availability checks with optional `ensure-mirror-python-env.sh` bootstrap.
    - Restored backend readiness wait loop via `curl` against `/ui`.
    - Restored Cloudflare tunnel supervisor loop with restart delay (`MIRROR_TUNNEL_RESTART_DELAY_SEC`).
  - `scripts/stop-mirror-app.sh`:
    - Added PID-file-based graceful termination helper for backend and tunnel supervisor before fallback `pkill`.
- **Commands**:
  - `bash -n scripts/start-mirror-app.sh` (pass)
  - `bash -n scripts/stop-mirror-app.sh` (pass)
- **Verification**:
  - `ReadLints` on both scripts returned no diagnostics.

## 2026-04-19 — Camera live preview full-screen FOV pass

- **Action**: Expanded camera live preview overlay to occupy the full mirror viewport and minimize crop.
- **Changes**:
  - `ui/src/features/camera/camera-overlay.css`:
    - Removed fixed preview caps (`min(92vw, 400px)` / max-height and fixed portrait frame).
    - Made `.camera-video-wrap` full-screen (`flex: 1`, `width/height: 100%`, no border radius).
    - Reduced stage padding/gap to zero so preview uses entire overlay.
    - Moved exit button to fixed top-right overlay so it does not consume preview space.
    - Kept `.camera-video { object-fit: contain; }` for widest visible field of view.
- **Commands**:
  - `npm run build` in `ui/` (pass)
- **Verification**:
  - `ReadLints` on updated CSS reported no diagnostics.

## 2026-04-19 — FOV env not affecting live preview under CLI fallback

- **Issue**: User changed camera aspect settings in `.env`, but live preview appeared unchanged.
- **Root Cause**: In `backend/services/pi_camera.py`, rpicam CLI fallback preview path used fixed dimensions (`180x320` warmup, `360x640` preview), ignoring configured camera aspect vars.
- **Action**: Updated CLI fallback warmup and preview paths to derive dimensions from `PI_CAMERA_CAPTURE_WIDTH/HEIGHT` and `PI_CAMERA_PREVIEW_LORES_MAX` via `_scaled_capture_dimensions` + `_lores_size_for_main`.
- **Commands**:
  - `python -m compileall backend/services/pi_camera.py` (pass)
- **Verification**:
  - `ReadLints` on `backend/services/pi_camera.py` reported no diagnostics.

## 2026-04-19 — WebRTC transition for mirror live camera preview

- **Action**: Implemented WebRTC-first camera preview path with automatic MJPEG fallback.
- **Changes**:
  - `backend/api/camera.py`: added `POST /api/camera/webrtc/offer` using `RTCPeerConnection` and `RTCSessionDescription`.
  - `backend/services/camera_webrtc.py`: added `PiCameraPreviewTrack` (`VideoStreamTrack`) sourcing frames from `camera_state.read_mjpeg_frame()`.
  - `backend/schemas/camera.py`: added `CameraWebRtcOfferIn` and `CameraWebRtcAnswerOut`.
  - `backend/requirements.txt`: added `aiortc`, `av`, `numpy`.
  - `ui/src/features/camera/useCameraStream.ts`: now negotiates WebRTC on mount and falls back to `/camera/live` MJPEG if negotiation/track startup fails.
  - `ui/src/features/camera/CameraOverlay.tsx`: renders `<video>` for WebRTC mode and preserves `<img>` path for MJPEG fallback.
- **Commands**:
  - `python -m compileall backend/api/camera.py backend/services/camera_webrtc.py backend/schemas/camera.py` (pass)
  - `npm run build` in `ui/` (pass)
- **Verification**:
  - `ReadLints` on all touched backend/UI files reported no diagnostics.

## 2026-04-19 — Native camera preview mode (no browser decode)

- **Action**: Switched capture-flow preview strategy to native `rpicam-hello` mode and removed newly added WebRTC path.
- **Why**: User requested `rpicam`-level smoothness and explicitly no UI-side live decode.
- **Changes**:
  - `backend/config.py`: added `CAMERA_NATIVE_PREVIEW` env flag.
  - `backend/services/pi_camera.py`:
    - added native preview process lifecycle (`start_native_preview`, `stop_native_preview`) using `rpicam-hello --fullscreen`.
    - ensured Picamera2 handle is released before native preview starts.
    - `close()` now also stops any active native preview process.
  - `backend/services/camera_service.py`:
    - capture flow now uses native preview when `CAMERA_NATIVE_PREVIEW=1`;
    - stops native preview before final still capture and on cleanup.
  - `ui/src/features/camera/CameraOverlay.tsx` and `camera-overlay.css`:
    - removed browser video/image decode from overlay;
    - overlay now shows control/status/countdown messaging only.
  - Reverted WebRTC additions to keep install/runtime light:
    - removed `POST /api/camera/webrtc/offer` and aiortc imports from `backend/api/camera.py`;
    - removed WebRTC schema models from `backend/schemas/camera.py`;
    - deleted `backend/services/camera_webrtc.py`;
    - removed `aiortc`, `av`, `numpy` from `backend/requirements.txt`;
    - simplified `ui/src/features/camera/useCameraStream.ts` back to MJPEG helper.
  - `.env.example`: documented `CAMERA_NATIVE_PREVIEW=0` toggle.
- **Commands**:
  - `python -m compileall backend/config.py backend/api/camera.py backend/services/camera_service.py backend/services/pi_camera.py backend/schemas/camera.py` (pass)
  - `npm run build` in `ui/` (pass)
- **Verification**:
  - `ReadLints` on all touched files reported no diagnostics.

## 2026-04-19 — Native preview reliability pass (status polling removal + strict startup)

- **Issue**: User reported camera preview still failing and `/camera/status` being called ~3 times/second.
- **Action**:
  - Removed Mirror UI HTTP fallback polling for `/api/camera/status` from `ui/src/app/MirrorApp.tsx` (the 400ms interval loop).
  - Removed obsolete `onPreviewFrameLoaded` wiring from `CameraOverlay` call/props since native preview mode has no browser frame source.
  - Made native preview startup strict in `backend/services/camera_service.py`: if `CAMERA_NATIVE_PREVIEW=1` and `rpicam-hello` does not start, capture flow now fails fast with clear error event.
  - Improved `backend/services/pi_camera.py` native preview error visibility: `rpicam-hello` stderr is captured and included when process exits immediately.
- **Commands**:
  - `python -m compileall backend/services/camera_service.py backend/services/pi_camera.py` (pass)
  - `npm run build` in `ui/` (pass)
- **Verification**:
  - `ReadLints` on touched files reported no diagnostics.

## 2026-04-19 — Fix rpicam-still even-width crash during capture

- **Issue**: Runtime capture failed with `finalise_output: 420/422 image width should be even` while using scaled dimensions (example width `405`).
- **Root Cause**: Camera sizing helpers could produce odd dimensions after scale/ratio calculations, which are invalid for YUV420 output in `rpicam-still`.
- **Action**: Updated `backend/services/pi_camera.py` dimension helpers to force even dimensions:
  - Added `_even_at_least_2()`.
  - `_scaled_capture_dimensions()` now returns even width/height.
  - `_lores_size_for_main()` now returns even width/height.
- **Commands**:
  - `python -m compileall backend/services/pi_camera.py` (pass)
- **Verification**:
  - `ReadLints` on `backend/services/pi_camera.py` reported no diagnostics.

## 2026-04-19 — Add camera startup dimension log line

- **Action**: Added one concise backend info log at native preview startup for effective camera dimensions.
- **Change**:
  - `backend/services/pi_camera.py` now logs:
    - `capture=<w>x<h>`
    - `preview=<w>x<h>` (derived lores)
    - `lores_max=<value>`
  - Log emits when `start_native_preview()` runs, which is the key capture-flow startup point.
- **Commands**:
  - `python -m compileall backend/services/pi_camera.py` (pass)
- **Verification**:
  - `ReadLints` on `backend/services/pi_camera.py` reported no diagnostics.

## 2026-04-19 — Dev tools native preview control endpoints + UI wiring

- **Action**: Added dev-tools control path for native camera preview so mirror dev camera toggle starts/stops `rpicam` preview directly.
- **Changes**:
  - `backend/schemas/camera.py`: added `CameraPreviewRequest`.
  - `backend/api/camera.py`:
    - added `POST /api/camera/preview/start` (uses `pi_camera.start_native_preview`, returns 503 with detailed error when native preview cannot start),
    - added `POST /api/camera/preview/stop`.
  - `ui/src/app/MirrorApp.tsx`:
    - dev tools camera toggle now calls preview start/stop endpoints;
    - opens overlay immediately, shows loading while start request is in-flight, and surfaces backend error text in overlay;
    - overlay close now stops native preview endpoint.
- **Commands**:
  - `python -m compileall backend/api/camera.py backend/schemas/camera.py` (pass)
  - `npm run build` in `ui/` (pass)
- **Verification**:
  - `ReadLints` on touched files reported no diagnostics.

## 2026-04-19 — Native OS countdown overlay on top of rpicam (capture + dev preview compatibility)

- **Action**: Added a lightweight native countdown overlay process and integrated it with camera capture lifecycle while keeping dev-tools native preview control flow.
- **Changes**:
  - Added `backend/tools/native_countdown_overlay.py` (Tk-based minimal always-on-top countdown window reading a small JSON state file).
  - Added `backend/services/native_countdown_overlay.py` (backend manager for start/update/hide/stop overlay process).
  - `backend/services/camera_service.py`:
    - hides overlay at capture start,
    - shows/updates overlay values on `CAMERA_COUNTDOWN_STARTED` and each `CAMERA_COUNTDOWN_TICK`,
    - hides/stops overlay on capture success, error, and service shutdown.
  - `backend/api/camera.py`:
    - `preview/start` and `preview/stop` now clear overlay state for dev preview session consistency.
  - `.env.example`:
    - added `CAMERA_NATIVE_COUNTDOWN_OVERLAY=1`.
- **Commands**:
  - `python -m compileall backend/services/native_countdown_overlay.py backend/tools/native_countdown_overlay.py backend/services/camera_service.py backend/api/camera.py` (pass)
  - `npm run build` in `ui/` (pass)
- **Verification**:
  - `ReadLints` on touched backend files and env example reported no diagnostics.

## 2026-04-19 — Remove old UI camera overlay loading/countdown architecture

- **Action**: Removed residual browser-side camera loading/countdown UI architecture now that native `rpicam` preview + native countdown overlay own those concerns.
- **Changes**:
  - `ui/src/app/hooks/useOverlayState.ts`: removed `cameraLoading` and `cameraCountdown` state.
  - `ui/src/app/MirrorApp.tsx`:
    - removed camera loading/countdown state plumbing and dev boot timer logic,
    - removed camera overlay loading/countdown props,
    - replaced countdown-based flow checks with a simple capture-flow activity ref.
  - `ui/src/features/camera/CameraOverlay.tsx`: removed loading spinner and countdown badge rendering; overlay now only shows native preview hint + optional error.
  - `ui/src/features/camera/index.ts`: removed `useCameraStream` export.
  - Deleted `ui/src/features/camera/useCameraStream.ts` (legacy MJPEG browser preview hook).
- **Commands**:
  - `npm run build` in `ui/` (pass)
- **Verification**:
  - `ReadLints` on touched UI files reported no diagnostics.

## 2026-04-19 — Investigate Google web OAuth callback 500

- **Action**: Began debugging "Internal Server Error after authenticating" for browser Google OAuth flow.
- **Commands / Reads**:
  - Read `backend/api/oauth_web.py`, `backend/services/auth_manager.py`, `backend/services/sync_service.py`, `backend/services/crypto.py`, `backend/database/models.py`.
  - Searched backend for OAuth and token exchange error paths with ripgrep.
  - Read active IDE terminal transcript to look for immediate traceback context.
- **Key findings**:
  - `GET /api/oauth/google/callback` can return 500 from post-token-exchange processing (`auth_manager.store_tokens_from_web`) if token persistence or downstream sync startup raises.
  - Current callback logs non-200 Google token responses but does not catch/log exceptions around token persistence path, so user sees a generic internal server error.
  - Terminal transcript captured Git history only, not backend runtime traceback, so server log inspection is still required to identify the exact failing statement on the Pi.

## 2026-04-19 — Add explicit Google callback error guard

- **Action**: Wrapped post-token-exchange processing in `backend/api/oauth_web.py` with explicit `try/except` to prevent opaque callback failures.
- **Change**:
  - Added `logger.exception(...)` around token parsing + `auth_manager.store_tokens_from_web("google", token)` path.
  - Raised `HTTPException(500, detail="Google login completed, but backend failed while saving tokens. Check backend logs.")` on failure for clearer diagnosis.
- **Commands**:
  - `python -m compileall backend/api/oauth_web.py` (pass)
- **Verification**:
  - `ReadLints` for `backend/api/oauth_web.py` reported no diagnostics.

## 2026-04-19 — Fix OAuthProvider `created_at` integrity mismatch

- **Runtime evidence from user**:
  - `sqlite3.IntegrityError: NOT NULL constraint failed: oauth_provider.created_at`
  - Failing insert target: `oauth_provider` during Google callback token save.
- **Root cause**:
  - ORM model `OAuthProvider` lacked `created_at`, while deployed SQLite schema requires it as non-null.
- **Action**:
  - Added `created_at = Column(DateTime, nullable=False, default=datetime.utcnow)` to `backend/database/models.py`.
- **Commands**:
  - `python -m compileall backend/database/models.py` (pass)
- **Verification**:
  - `ReadLints` for `backend/database/models.py` reported no diagnostics.

## 2026-04-19 — Fix OAuthProvider `updated_at` integrity mismatch

- **Runtime evidence from user**:
  - `sqlite3.IntegrityError: NOT NULL constraint failed: oauth_provider.updated_at`
  - Insert statement now includes `created_at`, confirming previous fix landed and next schema requirement surfaced.
- **Root cause**:
  - ORM model still lacked `updated_at`, while deployed SQLite schema requires it as non-null.
- **Action**:
  - Added `updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)` to `backend/database/models.py`.
- **Commands**:
  - `python -m compileall backend/database/models.py` (pass)
- **Verification**:
  - `ReadLints` for `backend/database/models.py` reported no diagnostics.

## 2026-04-19 — OAuth success redirect to hosted companion URL

- **Action**: Added automatic post-auth redirect for browser OAuth callbacks.
- **Changes**:
  - `backend/api/oauth_web.py`:
    - Added `_post_auth_redirect_url()` that resolves from:
      - `OAUTH_SUCCESS_REDIRECT_URL`
      - `SMART_MIRROR_WEB_URL`
      - fallback `https://smart-mirror.tech`
    - Google and Microsoft success callbacks now `302` redirect to the resolved URL after tokens are stored.
  - `.env.example`:
    - Added `OAUTH_SUCCESS_REDIRECT_URL=https://smart-mirror.tech`.
- **Commands**:
  - `python -m compileall backend/api/oauth_web.py` (pass)
- **Verification**:
  - `ReadLints` on touched files reported no diagnostics.

## 2026-04-19 — Add Microsoft callback error guard parity

- **Action**: Applied Google-style callback hardening to Microsoft browser OAuth callback.
- **Changes**:
  - Wrapped Microsoft token parse + `auth_manager.store_tokens_from_web("microsoft", ...)` in `try/except`.
  - Added `logger.exception("Microsoft callback failed while persisting tokens or starting sync")`.
  - Added explicit `HTTPException(500)` detail: `Microsoft login completed, but backend failed while saving tokens. Check backend logs.`
- **Commands**:
  - `python -m compileall backend/api/oauth_web.py` (pass)
- **Verification**:
  - `ReadLints` for `backend/api/oauth_web.py` reported no diagnostics.

## 2026-04-19 — Reduce calendar/event propagation latency after OAuth

- **User concern**: Calendar/tasks take too long to appear after Google auth; suspected auth/sync timing issue.
- **Findings**:
  - OAuth succeeded and sync loop did start, but post-auth population relied on async loop timing + frontend event delivery.
  - UI fallback polling interval was `60_000ms`, so missed WS refresh events could delay visible updates.
  - Google provider currently returns calendar events only; `fetch_tasks()` intentionally returns empty (Google Tasks API not integrated).
- **Changes**:
  - `backend/services/auth_manager.py`:
    - After storing OAuth tokens (both device and web flows), now runs `sync_manager.force_sync(provider_name)` immediately.
    - Starts periodic sync loop afterward with delayed first loop run (`run_immediately=False`).
  - `backend/services/sync_service.py`:
    - Added `run_immediately` parameter to `start_provider_sync` and `_sync_loop`.
    - Preserved existing default behavior for existing callers.
  - `ui/src/features/widgets/calendar/useCalendarFeed.ts`:
    - Reduced fallback poll interval from `60_000ms` to `15_000ms`.
- **Commands**:
  - `python -m compileall backend/services/auth_manager.py backend/services/sync_service.py` (pass)
  - `npm run build` in `ui/` (pass)
- **Verification**:
  - `ReadLints` on touched backend/UI files reported no diagnostics.

## 2026-04-19 — Calendar widget auto-scaling + richer event labeling

- **User request**: Calendar widget should use available space more effectively based on event count (e.g., 3 or 4 events fill widget), keep more events on one page where possible, and show clearer day/time details.
- **Changes**:
  - `ui/src/api/transforms/calendar.ts`:
    - Added derived labels per event: `dayLabel` (Today/Tomorrow/date), `timeLabel` (time range or all-day), and `detailLabel` (source + location when available).
  - `ui/src/features/widgets/calendar/CalendarWidget.tsx`:
    - Updated event row rendering to show day, time range, title, and metadata line.
    - Added `data-count` on page container for item-count-aware sizing.
  - `ui/src/features/widgets/calendar/calendar-widget.css`:
    - Made rows flex to consume available vertical space (`flex: 1`) so fewer events scale up and fill the widget.
    - Added count-based typography presets (`data-count` 1..6) and styles for new metadata fields.
  - `ui/src/features/widgets/useDisplayPagination.ts`:
    - Increased max events per page from 4 to 6 for larger widget sizes.
- **Commands**:
  - `npm run build` in `ui/` (pass)
- **Verification**:
  - `ReadLints` on touched files reported no diagnostics.

## 2026-04-19 — Calendar widget size-specific density tuning

- **User follow-up**: Tune visual density separately for `small` / `medium` / `large` widget sizes.
- **Changes** (`ui/src/features/widgets/calendar/calendar-widget.css`):
  - `small`: tighter spacing, reduced text sizes, hidden relative-time badge and metadata line to protect readability.
  - `medium`: balanced column width and two-line event clamp.
  - `large`: expanded left time/day column, larger typography, and metadata line retained with higher readability.
- **Commands**:
  - `npm run build` in `ui/` (pass)
- **Verification**:
  - `ReadLints` on updated CSS reported no diagnostics.

## 2026-04-19 — Calendar per-size hard page caps

- **User follow-up**: Add explicit max events-per-page per widget size.
- **Changes**:
  - `ui/src/features/widgets/calendar/CalendarWidget.tsx`:
    - Added `PAGE_SIZE_CAP_BY_PRESET` mapping:
      - `small: 3`
      - `medium: 5`
      - `large: 6`
    - Added `resolveCalendarPageSize(config)` to clamp dynamic area-based page size to the size preset cap.
- **Commands**:
  - `npm run build` in `ui/` (pass)
- **Verification**:
  - `ReadLints` on `CalendarWidget.tsx` reported no diagnostics.

## 2026-04-19 — Clock widget 12h/24h format support

- **User request**: Fix clock widget so it can display both 24-hour and 12-hour time.
- **Root cause**:
  - Companion app already persists `config_json.format` (`12h`/`24h`) for clock settings, but mirror UI ignored it and hardcoded `hour12: false`.
  - Mirror transform layer also dropped `format` on round-trip writes, so format settings could be lost.
- **Changes**:
  - `ui/src/features/widgets/types.ts`: added `WidgetConfig.format?: '12h' | '24h'`.
  - `ui/src/api/transforms.ts`: parse/persist `config_json.format` in `widgetFromBackend` and `widgetToBackend`.
  - `ui/src/features/widgets/clock/ClockWidget.tsx`:
    - consume `config.format`,
    - added `getClockDisplayParts()` helper to compute hour/minute/second and AM/PM,
    - render AM/PM marker in 12-hour mode,
    - keep 24-hour output unchanged by default.
  - `ui/src/features/widgets/clock/clock-widget.css`: added `.clock-meridiem` styling.
  - `ui/src/features/widgets/clock/ClockWidget.test.ts`: added focused unit tests for 24-hour formatting and 12-hour AM/PM conversion.
- **Commands**:
  - `npm run test -- src/features/widgets/clock/ClockWidget.test.ts` (pass)
  - `npm run build` in `ui/` (pass)
- **Errors + retries**:
  - Initial chained command failed in PowerShell because `&&` is not supported in this shell.
  - Retried with PowerShell-compatible separator and `$LASTEXITCODE` guard; succeeded.
- **Verification**:
  - `ReadLints` on all touched files reported no diagnostics.
