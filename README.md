# Smart Mirror

Smart Mirror is a mirror-first, edge-oriented dashboard system with:
- a FastAPI backend (`backend/`) for data, auth, camera, sync, and realtime events
- a React/Vite frontend (`ui/`) for widget rendering, menu navigation, and companion-state UX
- Raspberry Pi launch/deploy scripts for fullscreen mirror runtime

This repository is optimized for a physical mirror display where center reflection stays clear and widgets remain on the periphery.

## Current Architecture (Graphify Summary)

Based on `graphify-out/GRAPH_REPORT.md` (updated `2026-04-26`):
- `797` nodes
- `1439` edges
- `36` communities
- key hub abstractions: `D1SyncService`, `ButtonId`, `GoogleProvider`, `WidgetConfig`, `SyncStateInbound`, `AuthManager`

High-signal subsystem clusters:
- Auth + provider integration
- Camera and capture pipeline
- Widget persistence + sync state
- GPIO/button and control-event runtime
- Frontend widget config/transforms/theme/runtime APIs

## Repository Structure

Top-level layout:
- `backend/`: FastAPI app, database models, schemas, service layer
- `ui/`: React app, widget system, menu overlays, API client, hooks
- `hardware/`: GPIO integration and button abstractions
- `scripts/`: runtime launch/stop scripts (including Pi app mode)
- `deploy/`: deployment helpers (including Pi launcher/autostart)
- `docs/`: focused technical documentation
- `graphify-out/`: generated code knowledge graph outputs

Backend structure:
- `backend/main.py`: app composition and router mounting
- `backend/api/`: route handlers (`/widgets`, `/user/settings`, `/weather`, `/camera`, `/auth`, `/calendar`, `/email`, `/ws/control`, `/ws/buttons`)
- `backend/services/`: business logic (widget, user, weather, auth manager, device connection, realtime registries, D1 sync)
- `backend/schemas/`: request/response models and WS payload models
- `backend/database/`: SQLAlchemy models/session configuration

Frontend structure:
- `ui/src/app/`: `MirrorApp` shell and app-level hooks
- `ui/src/features/widgets/`: widget registry, widget components, persistence/sync engine, size presets
- `ui/src/components/`: menu overlay and reusable UI primitives
- `ui/src/hooks/`: input, control WS handlers, navigation, infra hooks
- `ui/src/config/`: widget parameter map, theme presets, backend origin
- `ui/src/api/`: typed API wrappers + backend payload transforms
- `ui/src/styles/`: design tokens and global theme variables

## Core Runtime Flows

### 1) Widget lifecycle

1. Frontend loads `/api/widgets/` + `/api/user/settings`.
2. Backend seeds default widgets if database is empty.
3. Frontend normalizes backend rows to local widget configs.
4. Widget edits/randomization/settings updates are pushed via `PUT /api/widgets/`.
5. Backend upserts by `id` or `widget_id` and removes stale rows.

Recent behavior highlights:
- randomization uses grid occupancy collision checks (no overlap/out-of-bounds)
- widget settings are staged in editor and committed on explicit Back
- frontend payload transform now hardens invalid numeric grid/freeform values before PUT

### 2) Companion/control channel

Control channel: `WS /ws/control`
- accepts `DEVICE_PAIR` and sync envelopes (`SYNC_STATE`, `WIDGETS_SYNC`)
- broadcasts lifecycle events (`DEVICE_SEARCHING`, `DEVICE_CONNECTING`, `DEVICE_CONNECTED`, errors/disconnect)
- now emits `MIRROR_STATE_SNAPSHOT`:
  - on websocket connect
  - when pair is received
  - after widgets sync is applied

Snapshot payload contains:
- current widget rows
- user settings
- device state
- layout revision token

This keeps companion app bootstrap state aligned with mirror state at connection time.

### 3) Weather pipeline

- Frontend calls `GET /api/weather/` with location + unit (`metric`/`imperial`)
- Backend proxies WeatherAPI `forecast.json` with `days=7`
- Backend pads forecast output to 7 entries if upstream plan returns fewer rows
- Backend caches weather snapshots in-memory (`5 min`)
- Frontend caches weather in localStorage (`10 min`) to reduce refresh-call pressure
- Large weather widget renders full 7-day forecast; size is preserved through randomization

## Menu and Interaction Model

Main menu includes:
- Take Picture
- Randomize Widgets
- Widget Settings
- Theme Styles
- Link Google (QR)
- Sleep
- Power Down
- Exit

Navigation model:
- `UP`/`DOWN`: move selection
- `SELECT`: invoke/cycle
- keyboard listeners remain as temporary dev input
- GPIO integration points are intentionally marked for replacement in code comments

Nested menu layers are handled in `useMenuNavigation`:
- `main`
- `widget_list`
- `parameter_editor`
- `randomize_panel`
- `theme_panel`
- `theme_widget_list`
- `theme_background_list`

## Theme System

Theme selection is split into:
- Widget Themes
- Background Themes

Stored as serialized pair in user settings theme field:
- format: `w:<widgetTheme>|b:<backgroundTheme>`

Theme config lives in:
- `ui/src/config/themePresets.ts`
- `ui/src/styles/tokens.css`

Includes legacy mapping so older theme strings still resolve.

## Connection UX

Connection presentation is intentionally minimal:
- no fullscreen connection takeover
- compact bottom-right device status chip
- error popup positioned off the main mirror focal area

This preserves mirror visual continuity while still surfacing app connectivity state.

## Authentication Scope

Current mirrored auth UX in menu is Google QR linking.
Microsoft OAuth is out of scope for mirror-side menu interactions.

## APIs (High-Level)

Common backend endpoints:
- `GET /api/widgets/`
- `PUT /api/widgets/`
- `GET /api/user/settings`
- `PUT /api/user/settings`
- `GET /api/weather/`
- `POST /api/camera/capture`
- `GET /api/auth/providers`
- `POST /api/auth/login/{provider}`
- `DELETE /api/auth/logout/{provider}`
- `GET /api/calendar/events`
- `GET /api/email/messages`
- `WS /ws/control`
- `WS /ws/buttons`

## Local Development

Backend (example):
```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r backend/requirements.txt
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

Frontend:
```bash
cd ui
npm install
npm run dev
```

Production UI build:
```bash
cd ui
npm run build
```

Run UI tests:
```bash
cd ui
npm run test -- --run
```

## Raspberry Pi Runtime

Launch mirror app (backend + Chromium app/fullscreen mode):
```bash
bash scripts/start-mirror-app.sh
```

Stop:
```bash
bash scripts/stop-mirror-app.sh
```

Install desktop launcher/autostart helper:
```bash
bash deploy/raspberry-pi/install-pi-launcher.sh
bash deploy/raspberry-pi/install-pi-launcher.sh --autostart
```

## Environment Variables

Common:
- `WEATHERAPI_KEY` (required for live weather)
- `WEATHERAPI_Q` (default location fallback)
- `ENABLE_DEV_ENDPOINTS` (`true` to expose dev simulation routes)

Pi launch tuning (examples):
- `MIRROR_KIOSK`
- `MIRROR_CHROMIUM_DISABLE_INFOBARS`
- `MIRROR_CHROMIUM_USE_OZONE_PLATFORM`
- `MIRROR_CHROMIUM_OZONE_PLATFORM`
- `MIRROR_CHROMIUM_EXTRA_ARGS`

## Notes for Contributors

- Prefer updating `ui/src/config/widgetParameters.ts` when adding widget-editable options.
- Keep widget randomization/grid logic in `ui/src/utils/widgetGrid.ts` unit-testable.
- Preserve API payload compatibility in `ui/src/api/transforms.ts`.
- Keep realtime/control payload changes schema-backed under `backend/schemas/`.
- After code changes, refresh graph artifacts:
  - `graphify update . --force`
