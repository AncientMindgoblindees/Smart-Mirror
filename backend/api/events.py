import os
from datetime import datetime
from typing import Any, Dict

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from backend.database.session import SessionLocal, get_db
from backend.schemas.mirror_sync_state import SyncStateInbound
from backend.services import button_service, widget_service
from backend.services.realtime import buttons_registry, control_registry
from hardware.gpio.config import ButtonId
from hardware.gpio.events import ButtonAction

router = APIRouter(tags=["events"])


@router.websocket("/ws/buttons")
async def ws_buttons(websocket: WebSocket, db: Session = Depends(get_db)) -> None:
    await websocket.accept()
    buttons_registry.connect(websocket)
    try:
        async for evt in button_service.iter_button_events():
            payload = button_service.handle_button_event(evt, db)
            await buttons_registry.broadcast(
                {
                    "type": "button",
                    "button_id": payload["button_id"],
                    "action": payload["action"],
                    "effect": payload["effect"],
                }
            )
            if websocket not in buttons_registry.active:
                # Broadcast removed this connection due to a send failure; stop.
                break
    except WebSocketDisconnect:
        pass
    finally:
        buttons_registry.disconnect(websocket)


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


@router.websocket("/ws/control")
async def ws_control(websocket: WebSocket) -> None:
    """
    Unified control channel:
    - accepts legacy SYNC_STATE
    - accepts v2 WIDGETS_SYNC envelope
    - broadcasts camera/status events to all control clients
    """
    await websocket.accept()
    control_registry.connect(websocket)
    try:
        while True:
            raw: Dict[str, Any] = await websocket.receive_json()
            raw_type = str(raw.get("type") or "").strip().upper()
            if raw_type not in {"SYNC_STATE", "WIDGETS_SYNC"}:
                continue
            payload = raw
            if raw_type == "WIDGETS_SYNC":
                payload = {
                    "type": "SYNC_STATE",
                    "widgets": raw.get("payload", {}).get("widgets", []),
                    "action": raw.get("payload", {}).get("action"),
                    "meta": {
                        "source": raw.get("payload", {}).get("source", "mobile-companion"),
                        "session_id": raw.get("sessionId"),
                        "ts": raw.get("timestamp") or datetime.utcnow().isoformat(),
                    },
                    "protocol_version": raw.get("version", 2),
                }
            try:
                sync = SyncStateInbound.model_validate(payload)
            except Exception as exc:  # noqa: BLE001
                await websocket.send_json({"type": "SYNC_ERROR", "message": str(exc)})
                continue
            db = SessionLocal()
            try:
                updates = widget_service.updates_from_sync_state(db, sync)
                widget_service.replace_widgets(db, updates)
                applied = {
                    "type": "WIDGETS_SYNC_APPLIED",
                    "version": 2,
                    "sessionId": raw.get("sessionId"),
                    "timestamp": datetime.utcnow().isoformat(),
                    "payload": {"count": len(updates)},
                }
                await websocket.send_json(applied)
                await control_registry.broadcast(applied)
            except Exception as exc:  # noqa: BLE001
                err = {
                    "type": "WIDGETS_SYNC_ERROR",
                    "version": 2,
                    "sessionId": raw.get("sessionId"),
                    "timestamp": datetime.utcnow().isoformat(),
                    "payload": {"message": str(exc)},
                }
                await websocket.send_json(err)
            finally:
                db.close()
    except WebSocketDisconnect:
        pass
    finally:
        control_registry.disconnect(websocket)

