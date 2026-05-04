import asyncio
import logging
from collections import deque
from datetime import datetime, timezone
from typing import AsyncGenerator, Deque, Optional

from hardware.gpio.buttons import Buttons
from hardware.gpio.config import ButtonId
from hardware.gpio.events import ButtonAction, ButtonEvent

logger = logging.getLogger(__name__)


_queue: Deque[ButtonEvent] = deque()
_buttons: Optional[Buttons] = None
_task: Optional[asyncio.Task] = None


def _on_event(evt: ButtonEvent) -> None:
    _queue.append(evt)


def start_button_service() -> None:
    """
    Start the button service.

    On non-Pi dev machines this runs in mock mode and
    events can be injected via the `emit_dev_event` helper.
    """
    global _buttons, _task
    if _buttons is not None:
        logger.info("gpio_button_service_already_running")
        return

    _buttons = Buttons(on_event=_on_event)
    logger.info("gpio_button_service_started")

    async def loop() -> None:
        while True:
            if _buttons is not None:
                _buttons.tick()
            await asyncio.sleep(0.05)

    _task = asyncio.create_task(loop())


def stop_button_service() -> None:
    global _buttons, _task
    if _buttons is not None:
        _buttons.close()
        logger.info("gpio_button_service_stopped")
    _buttons = None
    if _task is not None:
        _task.cancel()
        _task = None


async def button_events() -> AsyncGenerator[ButtonEvent, None]:
    """
    Async generator of button events for backend consumption.
    """
    while True:
        if _queue:
            evt = _queue.popleft()
            yield evt
        else:
            await asyncio.sleep(0.05)


def emit_dev_event(button_id: ButtonId, action: ButtonAction) -> None:
    """
    Helper for local development on non-Pi machines:
    push a synthetic event into the same queue used by GPIO.
    """
    logger.info("gpio_dev_event button_id=%s action=%s", button_id.value, action.value)
    _on_event(ButtonEvent(button_id=button_id, action=action, ts=datetime.now(timezone.utc)))

