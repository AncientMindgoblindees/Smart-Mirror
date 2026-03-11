## Smart Mirror – Agent-Oriented Dev Notes

This file is for **local development and Cursor agents** only.  
If you already have a `README.md` in your organization’s Smart-Mirror repo, **do not overwrite it**—keep this file separate (or copy only what you need into your existing docs).

### Repository Structure (for agents)

- `os/` – Raspberry Pi OS Lite setup scripts, Wayland/Chromium kiosk, `systemd` units.
- `backend/` – FastAPI backend (`api/`, `services/`, `database`).
- `hardware/` – GPIO buttons, camera, LED services.
- `ui/` – Smart mirror UI, widgets, layout engine, themes.
- `mobile-config/` – Web/mobile configuration dashboard.
- `ai-services/` – Pose/overlay inference services (NAS or cloud).
- `docs/` – Architecture, wiring, API, user + maintenance docs.
- `deployment/` – Deployment scripts/manifests for Pi, NAS, and optional cloud.

### Development Phases (Enforced by Agents)

1. **Core mirror UI**
   - Implement basic UI shell in `ui/` with clock, weather, calendar widgets.
   - Minimal backend in `backend/` to feed widget data and user preferences.
2. **GPIO buttons**
   - Add hardware services in `hardware/` and map button events into UI.
3. **Remote configuration**
   - Build `mobile-config/` web app and expand backend APIs for widget/theme config.
4. **Camera capture**
   - Implement camera control and `/capture/photo` endpoint.
5. **Wardrobe management + NAS**
   - Integrate NAS storage and wardrobe/outfit data flows.
6. **Outfit overlay (AI)**
   - Add remote inference pipeline and overlay UI, with a clean fallback when offline.

### Key Cursor Agents (High-Level)

- `chief_architect_agent` – overall architecture + coordination.
- `system_architecture_agent` – system diagram, tech stack, component interfaces.
- `requirements_validation_agent` – requirement extraction + traceability matrix.
- `primary_ui_ux_agent` – UI/UX lead, orchestrates widget, visual, interaction agents.
- `embedded_hardware_agent` – GPIO buttons, camera, LEDs and event system.
- `backend_service_agent` – FastAPI backend, DB schema, core APIs.
- `nas_integration_agent` – NAS mount, sync, storage structure.
- `computer_vision_agent` – remote inference and overlay design.
- `security_privacy_agent` – privacy architecture, auth, data handling policy.
- `documentation_agent` – all docs under `docs/`.

Use these agents in Cursor to design and implement each phase, with `chief_architect_agent` and `requirements_validation_agent` keeping the system aligned with the proposal.

