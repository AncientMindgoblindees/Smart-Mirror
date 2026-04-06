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
