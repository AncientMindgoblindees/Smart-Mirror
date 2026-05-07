import logging
from typing import AsyncGenerator, Dict

from sqlalchemy.orm import Session

from hardware.gpio.config import ButtonId
from hardware.gpio.events import ButtonAction, ButtonEvent
from hardware.gpio import service as gpio_service

logger = logging.getLogger(__name__)


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

    if event.button_id == ButtonId.UP and event.action == ButtonAction.CLICK:
        effect = "menu_up"
    elif event.button_id == ButtonId.DOWN and event.action == ButtonAction.CLICK:
        effect = "menu_down"
    elif event.button_id == ButtonId.LAYOUT and event.action in (
        ButtonAction.CLICK,
        ButtonAction.LONG_PRESS,
    ):
        effect = "menu_select"
    elif event.button_id == ButtonId.DOWN and event.action == ButtonAction.LONG_PRESS:
        effect = "dismiss_tryon"

    logger.info(
        "button_event button_id=%s action=%s effect=%s",
        event.button_id.value,
        event.action.value,
        effect,
    )

    return {
        "button_id": event.button_id.value,
        "action": event.action.value,
        "effect": effect,
    }


def emit_dev_event(button_id: ButtonId, action: ButtonAction) -> None:
    """
    Local development hook: inject synthetic events without GPIO.
    """
    logger.info("button_dev_event_injected button_id=%s action=%s", button_id.value, action.value)
    gpio_service.emit_dev_event(button_id, action)

