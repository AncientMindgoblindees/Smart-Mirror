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

## 2026-03-29 — Tunnel setup guidance for external app access

- **Action**: Verified how the mirror UI is served and prepared tunnel options for external application access.
- **Commands**: Searched repository for tunnel/expose references; read `README.md`, `docs/EXTERNAL-INTEGRATION-HOOKS.md`, and `backend/main.py`.
- **Result**: Confirmed UI is served via FastAPI at `/ui` (default `http://localhost:8000/ui/`) and CORS middleware currently allows all origins.
- **Decision**: Recommend `ngrok` (quick setup) or Cloudflare Tunnel (stable free hostname) with security notes for exposing beyond local network.

## 2026-03-29 — Cloudflare tunnel preference follow-up

- **Action**: Checked for existing Cloudflare tunnel config and local `cloudflared` installation.
- **Commands**: `rg` for Cloudflare/tunnel config keywords in repo; `cloudflared --version` in workspace terminal.
- **Result**: No existing Cloudflare tunnel config found in repository; `cloudflared` is not installed on this machine (`CommandNotFoundException`).
- **Decision**: Provide Windows setup steps for installing `cloudflared`, creating a named tunnel, mapping hostname, and running against local Smart Mirror backend on port `8000`.

## 2026-03-29 — Added Linux/Pi Cloudflare tunnel automation scripts

- **Action**: Added Linux-oriented scripts to install `cloudflared`, configure a named tunnel with DNS ingress, and run a quick temporary tunnel; added README usage section.
- **Files**:
  - `scripts/install-cloudflared.sh`
  - `scripts/setup-cloudflare-tunnel.sh`
  - `scripts/run-cloudflare-quick-tunnel.sh`
  - `README.md` (Cloudflare Tunnel section)
- **Commands**: Attempted `bash -n` syntax validation in PowerShell-hosted bash.
- **Error**: Validation reported `\r`/unexpected EOF parsing issues from local Windows shell context.
- **Retry/Fix Attempt**: Retried validation with PowerShell-compatible command chaining and simplified installer script function syntax.
- **Decision**: Keep scripts as bash/Pi-targeted assets; repository has `.gitattributes` rule `*.sh text eol=lf`, so on Linux/Pi checkout scripts resolve with LF line endings and run normally.

## 2026-03-29 — Integrate tunnel into Pi startup flow

- **Action**: Updated startup/shutdown scripts so Cloudflare tunnel lifecycle follows mirror app lifecycle, supporting reboot/login autostart behavior.
- **Files**:
  - `scripts/start-mirror-app.sh` (auto-start tunnel if configured)
  - `scripts/stop-mirror-app.sh` (stop tunnel PID if running)
  - `deploy/raspberry-pi/install-pi-launcher.sh` (chmod new tunnel scripts)
  - `README.md` (autostart/tunnel env var documentation)
- **Behavior**:
  - Default tunnel startup enabled via `MIRROR_ENABLE_TUNNEL=1`.
  - Default tunnel name: `smart-mirror-ui` (override with `MIRROR_TUNNEL_NAME`).
  - Tunnel starts only when `cloudflared` exists and `~/.cloudflared/config.yml` exists.
