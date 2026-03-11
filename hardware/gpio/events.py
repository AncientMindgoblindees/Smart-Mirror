from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum, auto

from hardware.gpio.config import ButtonId


class ButtonAction(str, Enum):
    PRESS = "PRESS"
    RELEASE = "RELEASE"
    CLICK = "CLICK"
    LONG_PRESS = "LONG_PRESS"


@dataclass
class ButtonEvent:
    button_id: ButtonId
    action: ButtonAction
    ts: datetime

    def to_dict(self) -> dict:
        return {
            "button_id": self.button_id.value,
            "action": self.action.value,
            "ts": self.ts.replace(tzinfo=timezone.utc).isoformat(),
        }

