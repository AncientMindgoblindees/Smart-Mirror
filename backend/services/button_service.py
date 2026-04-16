import asyncio
from typing import AsyncGenerator, Dict

from sqlalchemy.orm import Session

from backend import config
from backend.services.camera_service import camera_state
from hardware.gpio.config import ButtonId
from hardware.gpio.events import ButtonAction, ButtonEvent
from hardware.gpio import service as gpio_service


async def iter_button_events() -> AsyncGenerator[ButtonEvent, None]:
    async for evt in gpio_service.button_events():
        yield evt


def handle_button_event(event: ButtonEvent, db: Session) -> Dict[str, str]:
    """
    Apply backend-side effects for a button event.
    For now we only describe the effect; Phase 2 implementation
    can wire this into user/widget services and DB state.
    """
    effect = "none"

    if event.button_id == ButtonId.LAYOUT and event.action == ButtonAction.CLICK:
        effect = "cycle_layout"
    elif (
        event.button_id.value == config.CAMERA_CAPTURE_BUTTON
        and event.action == ButtonAction.CLICK
    ):
        effect = "capture_photo"
        asyncio.create_task(
            camera_state.start_capture(
                countdown_seconds=config.CAMERA_CAPTURE_COUNTDOWN_SEC,
                source="gpio-button",
                session_id=None,
            )
        )
    elif event.button_id == ButtonId.DISPLAY and event.action == ButtonAction.CLICK:
        effect = "toggle_dim"
    elif event.button_id == ButtonId.DISPLAY and event.action == ButtonAction.LONG_PRESS:
        effect = "toggle_sleep"
    elif event.button_id == ButtonId.DOWN and event.action == ButtonAction.CLICK:
        effect = "dismiss_tryon"

    return {
        "button_id": event.button_id.value,
        "action": event.action.value,
        "effect": effect,
    }


def emit_dev_event(button_id: ButtonId, action: ButtonAction) -> None:
    """
    Local development hook: inject synthetic events without GPIO.
    """
    gpio_service.emit_dev_event(button_id, action)

