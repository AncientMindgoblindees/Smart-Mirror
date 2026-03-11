from typing import List

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from backend.database.session import get_db
from backend.services import button_service
from hardware.gpio.config import ButtonId
from hardware.gpio.events import ButtonAction


router = APIRouter(tags=["events"])


@router.websocket("/ws/buttons")
async def ws_buttons(websocket: WebSocket, db: Session = Depends(get_db)) -> None:
    await websocket.accept()
    consumers: List[WebSocket] = [websocket]

    try:
        async for evt in button_service.iter_button_events():
            payload = button_service.handle_button_event(evt, db)
            # Broadcast to all connected sockets (Phase 2: simple single-client)
            for ws in list(consumers):
                try:
                    await ws.send_json(
                        {
                            "type": "button",
                            "button_id": payload["button_id"],
                            "action": payload["action"],
                            "effect": payload["effect"],
                        }
                    )
                except WebSocketDisconnect:
                    consumers.remove(ws)
    except WebSocketDisconnect:
        consumers.clear()


@router.post("/api/dev/buttons")
async def dev_button_event(button_id: str, action: str) -> dict:
    """
    Development-only endpoint to simulate button events without GPIO.
    """
    try:
        bid = ButtonId(button_id)
        act = ButtonAction(action)
    except ValueError:
        return {"status": "error", "message": "invalid button_id or action"}

    button_service.emit_dev_event(bid, act)
    return {"status": "ok"}

