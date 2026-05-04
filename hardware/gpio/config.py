from enum import Enum


class ButtonId(str, Enum):
    LAYOUT = "LAYOUT"
    UP = "UP"
    DOWN = "DOWN"


DEBOUNCE_MS = 30
LONG_PRESS_MS = 1800

def _load_pin_map() -> dict[ButtonId, int]:
    try:
        from hardware.gpio.pi_button_map import PI_BCM_PIN_MAP
    except Exception:
        PI_BCM_PIN_MAP = {}

    defaults = {
        ButtonId.UP: 17,
        ButtonId.DOWN: 27,
        ButtonId.LAYOUT: 22,
    }

    out: dict[ButtonId, int] = {}
    for button_id, fallback_pin in defaults.items():
        raw = PI_BCM_PIN_MAP.get(button_id.value, fallback_pin)
        try:
            out[button_id] = int(raw)
        except (TypeError, ValueError):
            out[button_id] = fallback_pin
    return out


# BCM pin mapping (override via hardware/gpio/pi_button_map.py)
PIN_MAP = _load_pin_map()

