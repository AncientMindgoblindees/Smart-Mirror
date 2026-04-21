from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Optional

from hardware.gpio.config import ButtonId


class ButtonAction(str, Enum):
    PRESS = "PRESS"
    RELEASE = "RELEASE"
    CLICK = "CLICK"
    LONG_PRESS = "LONG_PRESS"


class ButtonSemanticGroup(str, Enum):
    NONE = "none"
    MENU = "menu"
    PROFILE = "profile"
    DISPLAY = "display"
    CAMERA = "camera"
    OVERLAY = "overlay"


class ButtonSemanticAction(str, Enum):
    NONE = "none"
    MENU_OPEN = "menu_open"
    MENU_CLOSE = "menu_close"
    MENU_BACK = "menu_back"
    MENU_UP = "menu_up"
    MENU_DOWN = "menu_down"
    MENU_SELECT = "menu_select"
    PROFILE_MENU_OPEN = "profile_menu_open"
    DISPLAY_TOGGLE_DIM = "display_toggle_dim"
    DISPLAY_TOGGLE_SLEEP = "display_toggle_sleep"
    CAPTURE_PHOTO = "capture_photo"
    DISMISS_TRYON = "dismiss_tryon"
    CYCLE_LAYOUT = "cycle_layout"


@dataclass
class ButtonEvent:
    button_id: ButtonId
    action: ButtonAction
    ts: Optional[datetime] = field(default=None)

    def to_dict(self) -> dict:
        ts_str = self.ts.isoformat() if self.ts is not None else None
        return {
            "button_id": self.button_id.value,
            "action": self.action.value,
            "ts": ts_str,
        }

