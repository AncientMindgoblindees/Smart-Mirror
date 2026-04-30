from enum import Enum, auto


class ButtonId(str, Enum):
    LAYOUT = "LAYOUT"
    UP = "UP"
    DOWN = "DOWN"
    DISPLAY = "DISPLAY"


DEBOUNCE_MS = 30
LONG_PRESS_MS = 1800

# BCM pin mapping (can be adjusted per deployment)
PIN_MAP = {
    ButtonId.LAYOUT: 17,
    ButtonId.UP: 27,
    ButtonId.DOWN: 22,
    ButtonId.DISPLAY: 23,
}

