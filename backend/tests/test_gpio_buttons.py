from __future__ import annotations

import sys
import types

import pytest

from hardware.gpio import buttons as buttons_module
from hardware.gpio.config import ButtonId, DEBOUNCE_MS, LONG_PRESS_MS
from hardware.gpio.events import ButtonAction, ButtonEvent


class _FakeGPIO:
    BCM = "BCM"
    IN = "IN"
    PUD_UP = "PUD_UP"
    BOTH = "BOTH"
    LOW = 0
    HIGH = 1

    def __init__(self) -> None:
        self.setup_calls: list[tuple[int, str, str]] = []
        self.event_callbacks: dict[int, dict[str, object]] = {}
        self.input_value = self.HIGH
        self.mode = None
        self.warnings = None
        self.cleaned: list[int] | None = None

    def setwarnings(self, flag: bool) -> None:
        self.warnings = flag

    def setmode(self, mode: str) -> None:
        self.mode = mode

    def setup(self, pin: int, mode: str, pull_up_down: str | None = None) -> None:
        self.setup_calls.append((pin, mode, pull_up_down or ""))

    def add_event_detect(self, pin: int, edge: str, callback, bouncetime: int | None = None) -> None:
        self.event_callbacks[pin] = {"edge": edge, "callback": callback, "bouncetime": bouncetime}

    def input(self, channel: int) -> int:
        return self.input_value

    def remove_event_detect(self, pin: int) -> None:
        self.event_callbacks.pop(pin, None)

    def cleanup(self, pins: list[int]) -> None:
        self.cleaned = list(pins)


def _install_fake_gpio(monkeypatch: pytest.MonkeyPatch) -> _FakeGPIO:
    fake = _FakeGPIO()
    gpio_module = types.ModuleType("RPi.GPIO")
    for attr in ("BCM", "IN", "PUD_UP", "BOTH", "LOW", "HIGH"):
        setattr(gpio_module, attr, getattr(fake, attr))
    gpio_module.setwarnings = fake.setwarnings
    gpio_module.setmode = fake.setmode
    gpio_module.setup = fake.setup
    gpio_module.add_event_detect = fake.add_event_detect
    gpio_module.input = fake.input
    gpio_module.remove_event_detect = fake.remove_event_detect
    gpio_module.cleanup = fake.cleanup

    monkeypatch.setitem(sys.modules, "RPi", types.ModuleType("RPi"))
    monkeypatch.setitem(sys.modules, "RPi.GPIO", gpio_module)
    return fake


def _make_buttons(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("ENABLE_GPIO", "false")
    events: list[ButtonEvent] = []
    btn = buttons_module.Buttons(on_event=events.append)
    return btn, events


def test_rpi_interrupt_gpio_sets_pullups_and_edges(monkeypatch: pytest.MonkeyPatch):
    fake = _install_fake_gpio(monkeypatch)
    pressed: list[tuple[int, bool]] = []

    rpi = buttons_module._RPiInterruptGPIO(on_edge=lambda pin, state: pressed.append((pin, state)))
    rpi.setup(17, ButtonId.UP)

    assert fake.mode == fake.BCM
    assert fake.setup_calls == [(17, fake.IN, fake.PUD_UP)]
    assert fake.event_callbacks[17]["edge"] == fake.BOTH

    fake.input_value = fake.LOW
    fake.event_callbacks[17]["callback"](17)
    assert pressed[-1] == (17, True)

    fake.input_value = fake.HIGH
    fake.event_callbacks[17]["callback"](17)
    assert pressed[-1] == (17, False)


def test_buttons_click_emits_press_release_click(monkeypatch: pytest.MonkeyPatch):
    btn, events = _make_buttons(monkeypatch)
    times = iter([0, DEBOUNCE_MS + 1])
    monkeypatch.setattr(btn, "_now_ms", lambda: next(times))

    btn.process_edge(ButtonId.UP, True)
    btn.process_edge(ButtonId.UP, False)

    actions = [evt.action for evt in events]
    assert actions == [ButtonAction.PRESS, ButtonAction.RELEASE, ButtonAction.CLICK]


def test_buttons_debounce_ignores_fast_edges(monkeypatch: pytest.MonkeyPatch):
    btn, events = _make_buttons(monkeypatch)
    clock = {"now": 0}
    monkeypatch.setattr(btn, "_now_ms", lambda: clock["now"])

    btn.process_edge(ButtonId.DOWN, True)
    clock["now"] = DEBOUNCE_MS - 1
    btn.process_edge(ButtonId.DOWN, False)
    clock["now"] = DEBOUNCE_MS + 1
    btn.process_edge(ButtonId.DOWN, False)

    actions = [evt.action for evt in events]
    assert actions == [ButtonAction.PRESS, ButtonAction.RELEASE, ButtonAction.CLICK]


def test_buttons_long_press_suppresses_click(monkeypatch: pytest.MonkeyPatch):
    btn, events = _make_buttons(monkeypatch)
    clock = {"now": 0}
    monkeypatch.setattr(btn, "_now_ms", lambda: clock["now"])

    btn.process_edge(ButtonId.LAYOUT, True)
    clock["now"] = LONG_PRESS_MS
    btn.tick()
    clock["now"] = LONG_PRESS_MS + 10
    btn.process_edge(ButtonId.LAYOUT, False)

    actions = [evt.action for evt in events]
    assert actions == [ButtonAction.PRESS, ButtonAction.LONG_PRESS, ButtonAction.RELEASE]
