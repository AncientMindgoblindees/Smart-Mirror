import asyncio
from typing import Any, AsyncGenerator, Dict, List

from sqlalchemy.orm import Session

from backend import config
from backend.services.camera_service import camera_state
from hardware.gpio.config import (
    MENU_BACK_BUTTON,
    MENU_NAV_DOWN_BUTTON,
    MENU_NAV_UP_BUTTON,
    MENU_OPEN_HOLD_BUTTON,
    MENU_SELECT_BUTTON,
    ButtonId,
)
from hardware.gpio.events import (
    ButtonAction,
    ButtonEvent,
    ButtonSemanticAction,
    ButtonSemanticGroup,
)
from hardware.gpio import service as gpio_service


async def iter_button_events() -> AsyncGenerator[ButtonEvent, None]:
    async for evt in gpio_service.button_events():
        yield evt


def _resolve_capture_button() -> ButtonId | None:
    try:
        return ButtonId(config.CAMERA_CAPTURE_BUTTON)
    except ValueError:
        return None


def _effect_name(action: ButtonSemanticAction) -> str:
    effect_overrides = {
        ButtonSemanticAction.NONE: "none",
        ButtonSemanticAction.DISMISS_TRYON: "dismiss_tryon",
        ButtonSemanticAction.CYCLE_LAYOUT: "cycle_layout",
        ButtonSemanticAction.DISPLAY_TOGGLE_DIM: "toggle_dim",
        ButtonSemanticAction.DISPLAY_TOGGLE_SLEEP: "toggle_sleep",
        ButtonSemanticAction.PROFILE_MENU_OPEN: "open_profile_menu",
    }
    return effect_overrides.get(action, action.value)


def _resolve_semantics(event: ButtonEvent) -> Dict[str, Any]:
    capture_button = _resolve_capture_button()
    semantic_action = ButtonSemanticAction.NONE
    semantic_group = ButtonSemanticGroup.NONE
    semantic_actions: List[str] = []
    effect = "none"

    if event.action == ButtonAction.CLICK and event.button_id == MENU_BACK_BUTTON:
        semantic_action = ButtonSemanticAction.MENU_BACK
        semantic_group = ButtonSemanticGroup.MENU
        semantic_actions = [
            ButtonSemanticAction.MENU_BACK.value,
            ButtonSemanticAction.MENU_CLOSE.value,
            ButtonSemanticAction.CYCLE_LAYOUT.value,
        ]
        effect = _effect_name(ButtonSemanticAction.CYCLE_LAYOUT)
    elif event.action == ButtonAction.LONG_PRESS and event.button_id == MENU_OPEN_HOLD_BUTTON:
        semantic_action = ButtonSemanticAction.PROFILE_MENU_OPEN
        semantic_group = ButtonSemanticGroup.PROFILE
        semantic_actions = [
            ButtonSemanticAction.PROFILE_MENU_OPEN.value,
            ButtonSemanticAction.MENU_OPEN.value,
        ]
        effect = _effect_name(ButtonSemanticAction.PROFILE_MENU_OPEN)
    elif event.action == ButtonAction.CLICK and event.button_id == MENU_NAV_UP_BUTTON:
        semantic_action = ButtonSemanticAction.MENU_UP
        semantic_group = ButtonSemanticGroup.MENU
        semantic_actions = [ButtonSemanticAction.MENU_UP.value]
        if capture_button == event.button_id:
            semantic_actions.append(ButtonSemanticAction.CAPTURE_PHOTO.value)
            effect = _effect_name(ButtonSemanticAction.CAPTURE_PHOTO)
    elif event.action == ButtonAction.CLICK and event.button_id == MENU_NAV_DOWN_BUTTON:
        semantic_action = ButtonSemanticAction.MENU_DOWN
        semantic_group = ButtonSemanticGroup.MENU
        semantic_actions = [
            ButtonSemanticAction.MENU_DOWN.value,
            ButtonSemanticAction.DISMISS_TRYON.value,
        ]
        effect = _effect_name(ButtonSemanticAction.DISMISS_TRYON)
    elif event.action == ButtonAction.CLICK and event.button_id == MENU_SELECT_BUTTON:
        semantic_action = ButtonSemanticAction.MENU_SELECT
        semantic_group = ButtonSemanticGroup.MENU
        semantic_actions = [
            ButtonSemanticAction.MENU_SELECT.value,
            ButtonSemanticAction.DISPLAY_TOGGLE_DIM.value,
        ]
        effect = _effect_name(ButtonSemanticAction.DISPLAY_TOGGLE_DIM)
    elif event.action == ButtonAction.LONG_PRESS and event.button_id == MENU_SELECT_BUTTON:
        semantic_action = ButtonSemanticAction.DISPLAY_TOGGLE_SLEEP
        semantic_group = ButtonSemanticGroup.DISPLAY
        semantic_actions = [ButtonSemanticAction.DISPLAY_TOGGLE_SLEEP.value]
        effect = _effect_name(ButtonSemanticAction.DISPLAY_TOGGLE_SLEEP)

    ts = event.ts.isoformat() if event.ts is not None else None
    return {
        "button_id": event.button_id.value,
        "action": event.action.value,
        "effect": effect,
        "semantic_action": semantic_action.value,
        "semantic_group": semantic_group.value,
        "semantic_actions": semantic_actions,
        "ts": ts,
    }


def handle_button_event(event: ButtonEvent, db: Session) -> Dict[str, Any]:
    """
    Apply backend-side effects for a button event.
    `effect` remains a compatibility field for current UI consumers.
    `semantic_action` / `semantic_actions` are the preferred menu-aware
    contract for the new boot menu and keyboard simulation layer.
    """
    payload = _resolve_semantics(event)
    capture_button = _resolve_capture_button()

    if capture_button == event.button_id and event.action == ButtonAction.CLICK:
        asyncio.create_task(
            camera_state.start_capture(
                countdown_seconds=config.CAMERA_CAPTURE_COUNTDOWN_SEC,
                source="gpio-button",
                session_id=None,
            )
        )

    return payload


def emit_dev_event(button_id: ButtonId, action: ButtonAction) -> None:
    """
    Local development hook: inject synthetic events without GPIO.
    """
    gpio_service.emit_dev_event(button_id, action)

