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

