from __future__ import annotations

import os
import time
from typing import Callable, Dict, Optional

from hardware.gpio.config import (
    DEBOUNCE_MS,
    LONG_PRESS_MS,
    ButtonId,
    PIN_MAP,
)
from hardware.gpio.events import ButtonAction, ButtonEvent

Callback = Callable[[ButtonEvent], None]


class _MockGPIO:
    """
    Minimal mock used on non-Pi machines so imports don't fail.
    This does not automatically generate events; tests can call
    `emit_mock_event` via the Buttons class.
    """

    def __init__(self) -> None:
        self._pins: Dict[int, int] = {}

    def setup(self, pin: int) -> None:
        self._pins[pin] = 1


def _load_gpio_backend():
    """
    Lightweight GPIO loader.
    In dev (non-Pi), this returns a mock; on Pi, this can be
    switched to gpiozero or RPi.GPIO integration in a follow-up.
    """
    if os.getenv("ENABLE_GPIO") != "true":
        return _MockGPIO()
    # Placeholder: real GPIO integration to be added when running on Pi.
    return _MockGPIO()


class Buttons:
    """
    Debounced button handler.

    For Phase 2 planning + local dev, this class focuses on the
    public callback interface and timing logic; GPIO polling can
    be expanded for the real Pi environment.
    """

    def __init__(self, on_event: Callback) -> None:
        self._gpio = _load_gpio_backend()
        self._on_event = on_event
        self._state: Dict[ButtonId, Dict[str, Optional[float]]] = {}

        for bid, pin in PIN_MAP.items():
            self._gpio.setup(pin)
            self._state[bid] = {
                "last_change_ms": None,
                "pressed": False,
                "long_emitted": False,
            }

    def _now_ms(self) -> int:
        return int(time.time() * 1000)

    def process_edge(self, button_id: ButtonId, pressed: bool) -> None:
        """
        Called when a button edge is detected (mock or real).
        """
        s = self._state[button_id]
        now = self._now_ms()

        last_change = s["last_change_ms"]
        if last_change is not None and now - last_change < DEBOUNCE_MS:
            return

        s["last_change_ms"] = now

        if pressed:
            s["pressed"] = True
            s["long_emitted"] = False
            self._emit(button_id, ButtonAction.PRESS)
        else:
            # release
            was_pressed = s["pressed"]
            long_emitted = s["long_emitted"]
            s["pressed"] = False
            self._emit(button_id, ButtonAction.RELEASE)

            if was_pressed and not long_emitted:
                # treat as click
                self._emit(button_id, ButtonAction.CLICK)

    def tick(self) -> None:
        """
        Periodic tick; in a real loop, call this every ~50ms.
        This checks for long-press thresholds.
        """
        now = self._now_ms()
        for bid, s in self._state.items():
            if s["pressed"] and not s["long_emitted"] and s["last_change_ms"]:
                if now - s["last_change_ms"] >= LONG_PRESS_MS:
                    s["long_emitted"] = True
                    self._emit(bid, ButtonAction.LONG_PRESS)

    def _emit(self, button_id: ButtonId, action: ButtonAction) -> None:
        evt = ButtonEvent(
            button_id=button_id,
            action=action,
            ts=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        )
        # Convert ts to datetime in a follow-up; for dev focus on flow.
        self._on_event(evt)  # type: ignore[arg-type]

    # Convenience for local dev tests
    def emit_mock_event(self, button_id: ButtonId, action: ButtonAction) -> None:
        self._on_event(
            ButtonEvent(button_id=button_id, action=action, ts=time.gmtime())  # type: ignore[arg-type]
        )

