# Phase 1: Core UI + Backend — Implementation Plan

**Smart Mirror — Senior Design Group 12**  
**Target:** Raspberry Pi 5 (8GB RAM)  
**Scope:** Basic mirror UI shell, core widgets (Clock, Weather, Calendar), minimal backend for widget data and user preferences.

---

## 1. Overview

Phase 1 delivers a working smart mirror display with:
- A **backend** (FastAPI) serving widget configuration and user settings
- A **UI** (HTML/CSS/JS) with a grid layout and three core widgets
- Local development flow (backend + browser) and readiness for Pi deployment

**Out of scope:** GPIO buttons, camera, mobile config, NAS, AI/overlay.

---

## 2. Success Criteria

| Criterion | Target |
|-----------|--------|
| UI loads and displays time, weather, calendar | ✓ |
| Backend serves `/widgets` and `/user/settings` | ✓ |
| Widget layout configurable via backend | ✓ |
| Dark theme, high-contrast, mirror-appropriate | ✓ |
| CPU usage on Pi 5 under normal load | < 20% |
| UI interactions / transitions | < 500 ms |
| Local dev: `uvicorn` + browser works | ✓ |

---

## 3. Backend Implementation

### 3.1 Directory Structure

```
backend/
├── api/
│   ├── __init__.py
│   ├── widgets.py      # /widgets routes
│   └── user.py         # /user/settings routes
├── services/
│   ├── __init__.py
│   ├── widget_service.py
│   └── user_service.py
├── database/
│   ├── __init__.py
│   ├── models.py       # SQLAlchemy models
│   ├── session.py     # DB session factory
│   └── migrations/    # Alembic
├── schemas/
│   ├── __init__.py
│   ├── widget.py       # Pydantic schemas
│   └── user.py
├── main.py             # FastAPI app entry
├── config.py           # Settings (DB path, etc.)
└── requirements.txt
```

### 3.2 Database Schema (SQLite)

**Tables:**

| Table | Purpose |
|-------|---------|
| `widget_config` | id, widget_id (clock/weather/calendar), enabled, position_row, position_col, size_rows, size_cols, config_json, created_at, updated_at |
| `user_settings` | id, theme (dark/light), primary_font_size, accent_color, created_at, updated_at |

**Alembic:** Initialize with `alembic init`, create initial migration for these tables.

### 3.3 API Endpoints

#### `GET /widgets`
- **Response:** List of widget configs (id, widget_id, enabled, position, size, config_json)
- **Use:** UI fetches layout and widget settings on load

#### `PUT /widgets`
- **Body:** Array of widget configs (same shape)
- **Use:** Update layout (enable/disable, reorder, resize) — Phase 3 config UI will use this

#### `GET /user/settings`
- **Response:** User preferences (theme, font_size, accent_color)

#### `PUT /user/settings`
- **Body:** Partial user settings
- **Use:** Update theme and display preferences

#### `GET /health`
- **Response:** `{"status": "ok"}` — for health checks

### 3.4 Implementation Order (Backend)

1. **config.py** — Load DB path from env or default `./data/mirror.db`
2. **database/models.py** — Define `WidgetConfig`, `UserSettings`
3. **database/session.py** — SQLAlchemy engine + session factory
4. **Alembic** — `alembic init`, create migration, run upgrade
5. **schemas/** — Pydantic models for request/response
6. **services/** — CRUD for widgets and user settings
7. **api/** — Wire routes to services
8. **main.py** — Mount routers, add CORS, static file mount for `ui/`
9. **Seed data** — Script or migration to insert default widget config and user settings

---

## 4. UI Implementation

### 4.1 Directory Structure

```
ui/
├── index.html          # Single-page shell
├── css/
│   ├── base.css        # Reset, variables, typography
│   ├── layout.css      # Grid layout
│   └── widgets.css     # Widget-specific styles
├── js/
│   ├── app.js          # Bootstrap, widget registry, API client
│   ├── layout.js       # Grid layout engine
│   ├── widgets/
│   │   ├── base.js     # Base widget interface
│   │   ├── clock.js
│   │   ├── weather.js
│   │   └── calendar.js
│   └── api.js          # Fetch wrappers for backend
└── assets/             # Fonts, icons (optional)
```

### 4.2 Widget Interface

Each widget implements:

```javascript
{
  id: string,           // 'clock' | 'weather' | 'calendar'
  render(container, config) => void,   // Initial render
  update(data?) => void,               // Refresh data (optional payload)
  settings() => object,                // Default config
}
```

- **render:** Creates DOM, attaches to container, applies config
- **update:** Called on interval or when new data arrives; avoids full re-render
- **settings:** Default position, size, refresh interval, etc.

### 4.3 Layout Engine

- **Grid:** e.g. 4×4 or 6×4 cells; each widget occupies `size_rows × size_cols`
- **Config-driven:** Layout comes from `GET /widgets`; widgets render in order of `position_row`, `position_col`
- **CSS Grid:** Use `grid-template-rows` / `grid-template-columns`; each widget gets `grid-row` / `grid-column` from config

### 4.4 Core Widgets

| Widget | Data Source | Update Interval | Notes |
|--------|-------------|-----------------|-------|
| **Clock** | `new Date()` | 1 s | Time + optional date; no API |
| **Weather** | Open-Meteo (free, no key) or mock | 15 min | Temp, condition, icon; graceful offline fallback |
| **Calendar** | Mock / placeholder | 5 min | Next 3 events; real integration in later phase |

**Weather API:** Use [Open-Meteo](https://open-meteo.com/) (no API key). Backend can proxy to avoid CORS, or UI calls with `fetch` if CORS allows. Fallback: show "—" or cached data when offline.

### 4.5 Visual Design (Phase 1)

- **Background:** Dark (#0a0a0a or similar)
- **Text:** High contrast (#e8e8e8), min 48px for primary content
- **Accent:** Single accent color (e.g. #4a9eff) for highlights
- **Spacing:** Generous margins; widgets as floating panels
- **Animation:** 200–300 ms transitions, subtle fade/slide
- **Font:** System font stack or one web font (e.g. Inter, Source Sans) — keep lightweight for Pi

### 4.6 Implementation Order (UI)

1. **base.css** — CSS variables, typography, dark theme
2. **layout.css** — Grid structure
3. **index.html** — Shell with grid container, script tags
4. **api.js** — `getWidgets()`, `getUserSettings()`, `putWidgets()`, `putUserSettings()`
5. **base.js** — Base widget class/interface
6. **clock.js** — Clock widget (no API)
7. **layout.js** — Parse config, place widgets, call render
8. **app.js** — Fetch config on load, init layout, start update intervals
9. **weather.js** — Weather widget (Open-Meteo or mock)
10. **calendar.js** — Calendar widget (mock events)
11. **widgets.css** — Widget-specific styling

---

## 5. Integration

### 5.1 Serving the UI

- FastAPI mounts static files: `app.mount("/", StaticFiles(directory="ui", html=True), name="ui")`
- `index.html` at root; all assets under `/css`, `/js`, `/assets`
- API under `/api/widgets`, `/api/user/settings` (or `/widgets`, `/user/settings` with prefix)

### 5.2 Local Development

```bash
# Terminal 1: Backend
cd backend && uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Browser: http://localhost:8000
```

### 5.3 Environment

- `DATABASE_URL` or `MIRROR_DB_PATH` — defaults to `./data/mirror.db`
- `WEATHER_LAT`, `WEATHER_LON` — for weather API (optional; default to placeholder)
- No auth in Phase 1; single-user local device

---

## 6. Task Breakdown (Checklist)

### Backend
- [ ] Create `backend/config.py`
- [ ] Create `backend/database/models.py` (WidgetConfig, UserSettings)
- [ ] Create `backend/database/session.py`
- [ ] Initialize Alembic, add initial migration
- [ ] Create `backend/schemas/` (widget, user)
- [ ] Create `backend/services/widget_service.py`
- [ ] Create `backend/services/user_service.py`
- [ ] Create `backend/api/widgets.py`
- [ ] Create `backend/api/user.py`
- [ ] Create `backend/main.py` (app, routes, static mount)
- [ ] Add seed/default data script

### UI
- [ ] Create `ui/index.html`
- [ ] Create `ui/css/base.css`
- [ ] Create `ui/css/layout.css`
- [ ] Create `ui/css/widgets.css`
- [ ] Create `ui/js/api.js`
- [ ] Create `ui/js/widgets/base.js`
- [ ] Create `ui/js/widgets/clock.js`
- [ ] Create `ui/js/widgets/weather.js`
- [ ] Create `ui/js/widgets/calendar.js`
- [ ] Create `ui/js/layout.js`
- [ ] Create `ui/js/app.js`

### Integration
- [ ] Mount UI static files in FastAPI
- [ ] Verify local dev flow (uvicorn + browser)
- [ ] Test widget fetch and layout render
- [ ] Add simple health check

### Optional (Phase 1)
- [ ] Weather: Open-Meteo integration (backend proxy or direct)
- [ ] Offline fallback for weather/calendar
- [ ] Basic README section for dev setup

---

## 7. Dependencies

### Backend (existing in requirements.txt)
- fastapi, uvicorn[standard], httpx, python-multipart, sqlalchemy, alembic, pydantic

### Add (optional)
- `aiosqlite` — if using async SQLAlchemy with SQLite

### UI
- No build step; vanilla HTML/CSS/JS
- Optional: fetch from Open-Meteo (no extra deps)

---

## 8. Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Weather API rate limits | Cache responses; use Open-Meteo (generous free tier) |
| Pi 5 performance | Minimize re-renders; avoid heavy animations; profile with Chrome DevTools |
| CORS | Serve UI from same origin; no cross-origin in Phase 1 |
| Offline | Clock works; weather/calendar show placeholder or cached data |

---

## 9. Phase 2 Handoff

Phase 1 should leave clear extension points for:
- **Widget config API** — `/widgets` PUT ready for Phase 3 config UI
- **Widget enable/disable** — `enabled` flag in DB
- **Theme** — `user_settings.theme` ready for Phase 3
- **Hardware** — No GPIO in Phase 1; UI can later listen for button events via WebSocket or polling

---

## 10. References

- [DEV-AGENT-NOTES.md](../DEV-AGENT-NOTES.md) — Repo structure, phases
- [.cursor/agents/](../.cursor/agents/) — backend_service_agent, primary_ui_ux_agent, widget_system_agent, visual_design_agent, api_agent
