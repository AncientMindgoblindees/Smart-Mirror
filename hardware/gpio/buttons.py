from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any, Callable, Dict, Optional

from hardware.gpio.config import (
    DEBOUNCE_MS,
    LONG_PRESS_MS,
    ButtonId,
    PIN_MAP,
)
from hardware.gpio.events import ButtonAction, ButtonEvent

logger = logging.getLogger(__name__)

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

    def close(self) -> None:
        self._pins.clear()


class _RPiInterruptGPIO:
    """
    RPi.GPIO interrupt-backed implementation.
    Uses pull-up buttons (active-low): pressed when pin reads LOW.
    """

    def __init__(self, on_edge: Callable[[int, bool], None]) -> None:
        import RPi.GPIO as GPIO  # type: ignore[import-not-found]

        self._gpio = GPIO
        self._on_edge = on_edge
        self._bid_by_pin: Dict[int, ButtonId] = {}
        self._gpio.setwarnings(False)
        self._gpio.setmode(self._gpio.BCM)

    def setup(self, pin: int, button_id: ButtonId) -> None:
        self._bid_by_pin[pin] = button_id
        self._gpio.setup(pin, self._gpio.IN, pull_up_down=self._gpio.PUD_UP)

        def _callback(channel: int) -> None:
            try:
                # Active-low input with pull-up.
                pressed = self._gpio.input(channel) == self._gpio.LOW
            except Exception:
                return
            self._on_edge(channel, pressed)

        self._gpio.add_event_detect(pin, self._gpio.BOTH, callback=_callback, bouncetime=1)

    def close(self) -> None:
        try:
            for pin in self._bid_by_pin:
                self._gpio.remove_event_detect(pin)
        except Exception:
            pass
        try:
            self._gpio.cleanup(list(self._bid_by_pin.keys()))
        except Exception:
            pass

    def button_for_pin(self, pin: int) -> Optional[ButtonId]:
        return self._bid_by_pin.get(pin)


def _load_gpio_backend(on_edge: Callable[[int, bool], None]) -> Any:
    """
    Lightweight GPIO loader.
    In dev (non-Pi), this returns a mock; on Pi, this can be
    switched to gpiozero or RPi.GPIO integration in a follow-up.
    """
    if os.getenv("ENABLE_GPIO", "false").lower() != "true":
        logger.info("gpio_backend=mock reason=ENABLE_GPIO_false")
        return _MockGPIO()
    try:
        return _RPiInterruptGPIO(on_edge=on_edge)
    except Exception as exc:
        # Keep service running in mock mode if GPIO backend is unavailable.
        logger.warning("gpio_backend=mock reason=rpi_gpio_unavailable error=%s", exc)
        return _MockGPIO()


class Buttons:
    """
    Debounced button handler.

    For Phase 2 planning + local dev, this class focuses on the
    public callback interface and timing logic; GPIO polling can
    be expanded for the real Pi environment.
    """

    def __init__(self, on_event: Callback) -> None:
        self._gpio = _load_gpio_backend(self._on_gpio_edge)
        self._on_event = on_event
        self._state: Dict[ButtonId, Dict[str, Optional[float]]] = {}
        self._pin_to_button: Dict[int, ButtonId] = {}

        for bid, pin in PIN_MAP.items():
            self._pin_to_button[pin] = bid
            if isinstance(self._gpio, _RPiInterruptGPIO):
                self._gpio.setup(pin, bid)
            else:
                self._gpio.setup(pin)
            self._state[bid] = {
                "last_change_ms": None,
                "pressed": False,
                "long_emitted": False,
            }

    def _on_gpio_edge(self, pin: int, pressed: bool) -> None:
        bid = self._pin_to_button.get(pin)
        if bid is None:
            return
        self.process_edge(bid, pressed)

    def _now_ms(self) -> int:
        return int(datetime.now(timezone.utc).timestamp() * 1000)

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
            ts=datetime.now(timezone.utc),
        )
        self._on_event(evt)

    def close(self) -> None:
        close = getattr(self._gpio, "close", None)
        if callable(close):
            close()

    # Convenience for local dev tests
    def emit_mock_event(self, button_id: ButtonId, action: ButtonAction) -> None:
        self._on_event(
            ButtonEvent(button_id=button_id, action=action, ts=datetime.now(timezone.utc))
        )

