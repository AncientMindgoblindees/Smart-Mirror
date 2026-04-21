from enum import Enum, auto


class ButtonId(str, Enum):
    LAYOUT = "LAYOUT"
    UP = "UP"
    DOWN = "DOWN"
    DISPLAY = "DISPLAY"


DEBOUNCE_MS = 30
# Shared hold threshold for "hold to open profile/menu" and sleep access.
LONG_PRESS_MS = 1800

# Canonical role mapping for the shared four-button mirror menu.
MENU_BACK_BUTTON = ButtonId.LAYOUT
MENU_OPEN_HOLD_BUTTON = ButtonId.LAYOUT
MENU_NAV_UP_BUTTON = ButtonId.UP
MENU_NAV_DOWN_BUTTON = ButtonId.DOWN
MENU_SELECT_BUTTON = ButtonId.DISPLAY

# BCM pin mapping (can be adjusted per deployment)
PIN_MAP = {
    ButtonId.LAYOUT: 17,
    ButtonId.UP: 27,
    ButtonId.DOWN: 22,
    ButtonId.DISPLAY: 23,
}

