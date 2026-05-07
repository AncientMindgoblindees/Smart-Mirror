from hardware.gpio.config import ButtonId
from hardware.gpio.events import ButtonAction, ButtonEvent
from backend.services.button_service import handle_button_event


def test_layout_click_maps_to_menu_select() -> None:
    payload = handle_button_event(
        ButtonEvent(button_id=ButtonId.LAYOUT, action=ButtonAction.CLICK),
        db=object(),
    )
    assert payload["effect"] == "menu_select"


def test_layout_long_press_maps_to_menu_select() -> None:
    payload = handle_button_event(
        ButtonEvent(button_id=ButtonId.LAYOUT, action=ButtonAction.LONG_PRESS),
        db=object(),
    )
    assert payload["effect"] == "menu_select"
