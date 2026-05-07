# Raspberry Pi GPIO Button Setup

This guide configures physical GPIO buttons for:
- menu/navigation actions

## 1) Button-to-pin map file

Edit:
- `hardware/gpio/pi_button_map.py`

Default BCM mapping:
- `UP`: `17`
- `DOWN`: `27`
- `LAYOUT` (Select/Menu): `22`

Use BCM numbering in this file.

## 2) Wiring model

Current GPIO handler expects pull-up buttons (active-low):
- one leg of button -> configured BCM pin
- other leg -> `GND`

Internal pull-up is enabled in software, so no external resistor is required for basic wiring.

## 3) Enable GPIO runtime

Set in `.env`:

```env
ENABLE_GPIO=true
GPIO_DEBOUNCE_MS=80
GPIO_LONG_PRESS_MS=1800
```

`GPIO_DEBOUNCE_MS` should stay low (around `50-100`) so normal taps are not dropped.

## 4) Verify interrupts

Start mirror backend and press buttons.

Expected `/ws/buttons` effects:
- `UP` click -> `menu_up`
- `DOWN` click -> `menu_down`
- `LAYOUT` click -> `menu_select`
- `LAYOUT` long press -> `menu_select`
- `DOWN` long press -> `dismiss_tryon`

For local non-GPIO testing, use dev endpoint:

```bash
POST /api/dev/buttons?button_id=UP&action=CLICK
POST /api/dev/buttons?button_id=DOWN&action=CLICK
POST /api/dev/buttons?button_id=LAYOUT&action=CLICK
```

Requires:

```env
ENABLE_DEV_ENDPOINTS=true
```

### Backend log lines to expect

When backend starts:
- `gpio_buttons_enabled=true starting_button_service`
- `gpio_button_service_started`

When buttons are pressed:
- `button_event button_id=UP action=CLICK effect=menu_up`
- `button_event button_id=DOWN action=CLICK effect=menu_down`
- `button_event button_id=LAYOUT action=CLICK effect=menu_select`

## 5) Google auth persistence after power off/on

Google auth should persist across reboots if these are stable:

1. Database file persists on disk
   - default under repo `data/` unless `MIRROR_DB_PATH` overrides it.
2. `MIRROR_TOKEN_SECRET` stays the same across boots
   - changing it can make encrypted stored tokens unreadable.
3. Google refresh token remains valid (not revoked).

Recommended `.env` entries on Pi:

```env
MIRROR_DB_PATH=/home/pi/Smart-Mirror/data/mirror.db
MIRROR_TOKEN_SECRET=your-long-stable-secret-value
```
