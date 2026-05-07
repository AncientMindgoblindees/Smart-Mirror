# Phase 2: GPIO Buttons — Concrete Implementation Plan

**Smart Mirror — Senior Design Group 12**  
**Target:** Raspberry Pi 5 (8GB RAM)  
**Scope:** Physical GPIO button panel that drives layout, theme, refresh, and display modes, integrated with the existing Phase 1 backend and UI.

---

## 1. Overview

Phase 2 adds **physical interaction** to the Smart Mirror via a **4‑button GPIO panel**. The goals are:

- Map button presses into **simple, predictable actions** (layout, theme, refresh, display mode).
- Keep the mirror primarily a **passive display**; buttons are for quick, low‑friction adjustments.
- Reuse and extend the **Phase 1 backend and UI** (widgets + user settings) without refactors.

Phase 2 does **not** implement full camera, wardrobe, or NAS features. It prepares the hardware + event channel so later phases can plug in richer actions.

---

## 2. Success Criteria

| Criterion | Target |
|----------|--------|
| Button presses are detected and debounced on Pi | ✓ |
| Backend receives normalized button events | ✓ |
| UI responds to button events in \< 500 ms | ✓ |
| Layout can be cycled via button | ✓ |
| Theme can be toggled via button | ✓ |
| Display can enter dim/sleep modes via button | ✓ |
| System behaves safely on long‑press actions | ✓ |

---

## 3. Physical Button Design (GPIO)

### 3.1 Button roles

Assume **four momentary push buttons** mounted vertically on the mirror frame (top → bottom), named `B1`–`B4`:

- **B1 — Layout / Mode**
  - **Short press:** Cycle to the **next predefined layout/page** (e.g., Home → Agenda → Weather‑focused → Minimal clock → Home).
  - **Long press:** Reserved for **future “Quick Config” mode** (brightness/theme adjustments) — stubbed in Phase 2.
- **B2 — Focus / Navigate up** (future‑facing)
  - **Short press:** Move focus **up** between widgets on the current layout (no‑op in Phase 2 UI, but event is defined for later).
  - **Long press:** Reserved (e.g., widget‑specific “previous” action).
- **B3 — Focus / Navigate down** (future‑facing)
  - **Short press:** Move focus **down** between widgets (no‑op in Phase 2 UI, event defined for later).
  - **Long press:** Reserved (e.g., widget‑specific “next” action).
- **B4 — Display**
  - **Short press:** Toggle between **normal** and **dim/ambient** display modes.
  - **Long press:** Toggle **sleep** mode (very low‑information / black screen), ready for future camera/overlay integration.

For Phase 2, **only B1 (layout)** and **B4 (display)** must have visible UI effects; B2/B3 events are captured and forwarded but can be no‑ops in the UI.

### 3.2 Wiring & GPIO configuration (concept)

> Final pin numbers can be adjusted in `hardware/gpio/config.py` to match the actual build.

- Use **BCM numbering** with internal **pull‑ups**, buttons wired to **GND**:
  - `B1 (LAYOUT)` → `GPIO17`
  - `B2 (UP)` → `GPIO27`
  - `B3 (DOWN)` → `GPIO22`
  - `B4 (DISPLAY)` → `GPIO23`
- All buttons:
  - Mode: input, **pull‑up enabled**, debounced in software.
  - Debounce: **20–50 ms**.
  - Long‑press threshold: **1500–2000 ms**.

---

## 4. Hardware Service Layer (`hardware/`)

### 4.1 Directory structure

```text
hardware/
  gpio/
    __init__.py
    config.py       # Pin map, timing constants, enums
    buttons.py      # GPIO setup, debouncing, click vs long‑press
    events.py       # ButtonAction/ButtonId + ButtonEvent model
    service.py      # Background loop, async generator / queue for events
  tests/
    test_buttons.py # Simple on‑Pi button test CLI
```

### 4.2 Modules and responsibilities

- **`hardware/gpio/config.py`**
  - Defines:
    - `ButtonId` enum: `LAYOUT`, `UP`, `DOWN`.
    - `PIN_MAP = {ButtonId.UP: 17, ButtonId.DOWN: 27, ButtonId.LAYOUT: 22}`.
    - Timing constants: `DEBOUNCE_MS`, `LONG_PRESS_MS`.
  - Keeps **all hardware‑specific details** in one place so they can be documented and changed without touching logic.

- **`hardware/gpio/events.py`**
  - Defines:
    - `ButtonAction`: `PRESS`, `RELEASE`, `CLICK`, `LONG_PRESS`.
    - `ButtonEvent` dataclass: `{button_id, action, ts}` (UTC timestamp).
  - Contains a small helper to convert events to JSON‑ready dicts.

- **`hardware/gpio/buttons.py`**
  - Wraps the chosen GPIO library (`gpiozero` or `RPi.GPIO`):
    - Configures pins as inputs with pull‑ups.
    - For each button, tracks:
      - Last state
      - Last change timestamp
      - Whether a `LONG_PRESS` has already been emitted
  - Emits high‑level `ButtonEvent` instances to a callback or queue when:
    - A **debounced click** is detected → `CLICK`.
    - A **held press** crosses `LONG_PRESS_MS` → `LONG_PRESS`.
  - No networking or FastAPI imports here; **hardware‑only**.

- **`hardware/gpio/service.py`**
  - Provides a process‑ or thread‑safe interface between hardware and backend:
    - `start_button_service()` – start background polling loop / event handlers.
    - `stop_button_service()` – cleanly release GPIO on shutdown.
    - `async def button_events()` – async generator or accessor for `asyncio.Queue[ButtonEvent]`.
  - Called from backend startup/shutdown hooks (Phase 2 integration).

- **`hardware/tests/test_buttons.py`**
  - Simple CLI script to run directly on Pi:
    - Prints out `ButtonId` + `ButtonAction` when events fire.
    - Confirms debouncing and long‑press behavior before integrating with backend.

### 4.3 Implementation order (hardware)

1. Create `hardware/gpio/config.py` with pin map and timing constants.  
2. Implement `hardware/gpio/events.py` with `ButtonId`, `ButtonAction`, and `ButtonEvent`.  
3. Implement `hardware/gpio/buttons.py` using a mockable GPIO wrapper (so it can run in dev without Pi).  
4. Implement `hardware/gpio/service.py` with an in‑process event queue and `button_events()` async generator.  
5. Add `hardware/tests/test_buttons.py` and validate behavior on actual Pi hardware.  

---

## 5. Backend Integration (FastAPI)

Phase 2 extends the existing backend (`backend/`) to **consume button events** and expose them to the UI via **WebSocket**, while also mapping certain events to state changes using existing APIs.

### 5.1 Directory / module updates

```text
backend/
  api/
    events.py        # /ws/buttons WebSocket endpoint
  services/
    button_service.py # Glue between hardware.gpio.service and backend actions
  config.py          # Optionally: flags for enabling GPIO on non‑Pi vs Pi
```

### 5.2 Button event service (`backend/services/button_service.py`)

Responsibilities:

- Bridge between `hardware/gpio/service.py` and the rest of the backend.
- Provide a **single source** for button events and derived actions.

Key functions (conceptual):

- `async def iter_button_events()`  
  - Async generator yielding `ButtonEvent` objects from `hardware.gpio.service.button_events()`.

- `async def handle_button_event(event: ButtonEvent, db: Session)`  
  - Applies **stateful effects** using existing services:
    - `LAYOUT + CLICK`: cycle through a small set of **named layouts** and persist the current layout id.
    - `DISPLAY + CLICK`: toggle `display_mode` (e.g., `normal`/`dim`) in `user_settings` or a dedicated field.
    - `DISPLAY + LONG_PRESS`: toggle `sleep` mode flag.
  - Returns a simple dict summarizing the action so WebSocket consumers can update UI.

Notes:

- Layout cycling in Phase 2 can be represented as a simple **integer layout index** stored in DB or as a field on `UserSettings` (e.g., `current_layout`).
- For now, **no new DB tables are strictly required**; we can extend `user_settings` with layout/display fields if needed.

### 5.3 WebSocket endpoint (`backend/api/events.py`)

Add a WebSocket that streams normalized button events (and optional derived actions) to all connected UIs:

- Path: `GET /ws/buttons`
- Behavior:
  - On connection:
    - Subscribe to `button_service.iter_button_events()`.
    - For each event:
      - Call `button_service.handle_button_event(event, db)` to apply backend‑side changes.
      - Send a compact JSON payload to the client:

```json
{
  "type": "button",
  "button_id": "LAYOUT",
  "action": "CLICK",
  "ts": "2026-03-11T15:00:00Z",
  "effect": "cycle_layout"     // optional: describes what backend did
}
```

- Use FastAPI’s WebSocket support with a simple **broadcaster** pattern for multiple clients (mirror UI + possible mobile debug client).

### 5.4 Backend startup/shutdown

In `backend/main.py`:

- On startup:
  - Call `hardware.gpio.service.start_button_service()` **only when running on Pi** (guarded by config/env flag, e.g., `ENABLE_GPIO=true`).  
  - Ensure the DB schema supports any new fields (layout/display mode) via migration or `create_all` update.
- On shutdown:
  - Call `hardware.gpio.service.stop_button_service()`.

---

## 6. UI Integration (Phase 2)

The UI remains **vanilla HTML/CSS/JS** as in Phase 1. Phase 2 adds a **button event client** and maps events to simple behaviors.

### 6.1 JS modules and responsibilities

```text
ui/js/
  app.js          # Extend with button event handling
  buttons.js      # New: connect to /ws/buttons and dispatch events
  layout.js       # Optionally extended to support multiple layouts
```

- **`ui/js/buttons.js`**
  - Opens a WebSocket connection to `/ws/buttons`.
  - Normalizes messages into simple events for `app.js`, e.g.:
    - `onButtonEvent({ button_id: 'LAYOUT', action: 'CLICK' })`.
  - Handles reconnects with a backoff strategy and exposes a tiny API:
    - `startButtonListener(onEvent)`
    - `stopButtonListener()`

- **`ui/js/app.js` (Phase 2 changes)**
  - Imports and invokes `startButtonListener(handleButtonEvent)`.
  - Maintains a small `interactionState`:

```js
const interactionState = {
  layoutIndex: 0,          // maps to known layouts
  displayMode: 'normal',   // 'normal' | 'dim' | 'sleep'
};
```

  - On button events, performs the following behaviors:
    - `LAYOUT + CLICK`:
      - Increment `layoutIndex` (wrap around).
      - Re‑fetch `/widgets` if layouts are stored server‑side, or switch to a client‑side layout definition.
    - `DISPLAY + CLICK`:
      - Toggle `displayMode` between `normal` and `dim` and add/remove CSS class on `body`.
    - `DISPLAY + LONG_PRESS`:
      - Toggle `displayMode` between `normal` and `sleep` and update CSS class.
    - `UP`/`DOWN`:
      - For Phase 2, may be **no‑ops** with a tiny, non‑distracting animation to indicate life, or left unused but logged to console for testing.

### 6.2 CSS updates

Add new classes in `base.css` / `layout.css` to reflect display modes:

- `.display-dim` – slight reduction in opacity/brightness:
  - Lower overall luminance (e.g., background closer to black, text slightly dimmed).
- `.display-sleep` – near‑black screen with optional tiny clock:
  - Hide most widgets, optionally show only the clock widget or a very small time indicator.

These modes must still preserve **readability** but reduce distraction and light pollution in a bedroom.

### 6.3 Implementation order (UI)

1. Add `buttons.js` with WebSocket client and event callback interface.  
2. Extend `app.js` to track `interactionState` and handle button events.  
3. Add CSS classes for `display-dim` and `display-sleep` in existing stylesheets.  
4. Manually test:
   - Layout cycling.
   - Dim and sleep behavior.  
5. Verify the UI still works without WebSocket (buttons disconnected) — it should **gracefully degrade**.

---

## 7. Task Breakdown (Checklist)

### 7.1 Hardware

- [ ] Create `hardware/gpio/config.py` with pin map and timing constants.  
- [ ] Create `hardware/gpio/events.py` with `ButtonId`, `ButtonAction`, and `ButtonEvent`.  
- [ ] Implement `hardware/gpio/buttons.py` with debounced click vs long‑press detection.  
- [ ] Implement `hardware/gpio/service.py` with background loop and `button_events()` generator/queue.  
- [ ] Add `hardware/tests/test_buttons.py` and validate on Raspberry Pi 5.  
- [ ] Document wiring and pin mapping in `docs/` (existing or new hardware doc).

### 7.2 Backend

- [ ] Add `backend/services/button_service.py` for bridging hardware events and backend actions.  
- [ ] Add `backend/api/events.py` with `/ws/buttons` WebSocket endpoint.  
- [ ] Integrate button service lifecycle into `backend/main.py` startup/shutdown (guarded by config flag).  
- [ ] Extend `user_settings` or related schema if needed for layout/display fields (and create migration if Alembic is enabled).  
- [ ] Write minimal tests or manual scripts to simulate button events and verify backend reactions.

### 7.3 UI

- [ ] Add `ui/js/buttons.js` to connect to `/ws/buttons` and dispatch events.  
- [ ] Extend `ui/js/app.js` with `interactionState` and `handleButtonEvent`.  
- [ ] Update CSS for `display-dim` and `display-sleep` modes.  
- [ ] Test that button events reflect correctly in layout/theme/display without noticeable lag.  
- [ ] Confirm that UI behaves correctly when the WebSocket is unavailable (no errors or freezes).

---

## 8. Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| GPIO library differences between dev and Pi | Abstract all GPIO calls in `hardware/gpio/buttons.py` and provide a mock implementation for non‑Pi development. |
| Button bounce / unreliable presses | Centralized debouncing and long‑press detection in `buttons.py` with real‑world tuning on Pi. |
| WebSocket connectivity issues | Implement auto‑reconnect and graceful degradation in `ui/js/buttons.js`; mirror still fully works as a passive display. |
| Overly complex interactions | Keep Phase 2 button effects minimal (layout + display modes), reserve advanced focus/quick config/capture for later phases. |
| Safety/privacy around display sleep modes | Make all display and sleep actions reversible and avoid any destructive operations on short press. |

---

## 9. Phase 3+ Handoff

Phase 2 prepares the system for later phases by:

- Establishing a reusable **hardware event pipeline** (`hardware/` → `backend/services/button_service.py` → `/ws/buttons` → UI).
- Defining a **button vocabulary** (`LAYOUT`, `UP`, `DOWN`, `DISPLAY` with CLICK/LONG_PRESS) that future features (camera capture, outfit overlay, remote config) can reuse.
- Keeping all behavior **configurable and extendable** via the existing backend layout and user settings mechanisms, avoiding tight coupling to any single phase’s UI.  

This plan should give Phase 3 (Remote Configuration) and Phase 4 (Camera Capture) a stable, tested base of physical interactions and event streaming to build on.

