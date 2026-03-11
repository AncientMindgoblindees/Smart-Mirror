import os
from typing import Any, Dict, Set

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from backend.database.session import get_db
from backend.services import button_service
from hardware.gpio.config import ButtonId
from hardware.gpio.events import ButtonAction


class ConnectionManager:
    """Shared per-process registry of active WebSocket connections."""

    def __init__(self) -> None:
        self.active: Set[WebSocket] = set()

    def connect(self, ws: WebSocket) -> None:
        self.active.add(ws)

    def disconnect(self, ws: WebSocket) -> None:
        self.active.discard(ws)

    async def broadcast(self, data: Dict[str, Any]) -> None:
        for ws in list(self.active):
            try:
                await ws.send_json(data)
            except Exception:
                self.active.discard(ws)


manager = ConnectionManager()

router = APIRouter(tags=["events"])


@router.websocket("/ws/buttons")
async def ws_buttons(websocket: WebSocket, db: Session = Depends(get_db)) -> None:
    await websocket.accept()
    manager.connect(websocket)
    try:
        async for evt in button_service.iter_button_events():
            payload = button_service.handle_button_event(evt, db)
            await manager.broadcast(
                {
                    "type": "button",
                    "button_id": payload["button_id"],
                    "action": payload["action"],
                    "effect": payload["effect"],
                }
            )
            if websocket not in manager.active:
                # Broadcast removed this connection due to a send failure; stop.
                break
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(websocket)


@router.post("/api/dev/buttons")
async def dev_button_event(button_id: str, action: str) -> Any:
    """
    Development-only endpoint to simulate button events without GPIO.
    Only available when ENABLE_DEV_ENDPOINTS=true.
    """
    if os.getenv("ENABLE_DEV_ENDPOINTS", "false").lower() != "true":
        return JSONResponse(status_code=404, content={"detail": "Not Found"})
    try:
        bid = ButtonId(button_id)
        act = ButtonAction(action)
    except ValueError:
        return {"status": "error", "message": "invalid button_id or action"}

    button_service.emit_dev_event(bid, act)
    return {"status": "ok"}

