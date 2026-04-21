import asyncio
import logging
import os
from datetime import datetime
from typing import Any, Dict

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

from backend.database.models import Mirror, UserProfile
from backend.database.session import SessionLocal, get_db
from backend.schemas.mirror_sync_state import SyncStateInbound
from backend.services import button_service, user_service, widget_service
from backend.services.device_connection import device_connection
from backend.services.realtime import buttons_registry, control_registry
from hardware.gpio.config import ButtonId
from hardware.gpio.events import ButtonAction

router = APIRouter(tags=["events"])


def _resolve_mirror_context_from_websocket(db: Session, websocket: WebSocket) -> tuple[str, str]:
    def header_value(*names: str) -> str | None:
        for name in names:
            value = websocket.headers.get(name)
            if value:
                return value
        return None

    hardware_id = (
        header_value("x-mirror-hardware-id", "x-hardware-id")
        or websocket.query_params.get("hardware_id")
    )
    mirror = None
    if hardware_id:
        mirror = user_service.get_mirror_by_hardware_id(db, hardware_id)
    if mirror is None:
        mirrors = db.query(Mirror).order_by(Mirror.created_at.asc()).all()
        if len(mirrors) == 1:
            mirror = mirrors[0]
    if mirror is None:
        raise ValueError("Mirror is not registered")

    user_id = header_value("x-mirror-user-id", "x-user-id") or websocket.query_params.get("user_id")
    if user_id:
        profile = (
            db.query(UserProfile)
            .filter(
                UserProfile.mirror_id == mirror.id,
                UserProfile.user_id == user_id,
            )
            .first()
        )
        if profile is None:
            raise ValueError("Requested profile is not enrolled on this mirror")
    else:
        profile = user_service.get_active_profile(db, mirror.id)
    if profile is None:
        raise ValueError("No active profile for mirror")

    return mirror.id, profile.user_id


@router.websocket("/ws/buttons")
async def ws_buttons(websocket: WebSocket, db: Session = Depends(get_db)) -> None:
    await websocket.accept()
    buttons_registry.connect(websocket)
    try:
        async for evt in button_service.iter_button_events():
            payload = button_service.handle_button_event(evt, db)
            await buttons_registry.broadcast({"type": "button", **payload})
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
    UI consumers should prefer the semantic fields broadcast on `/ws/buttons`
    (`semantic_action`, `semantic_actions`, `semantic_group`) over the legacy
    compatibility `effect` field.
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


_paired_sockets: Dict[WebSocket, str] = {}


@router.websocket("/ws/control")
async def ws_control(websocket: WebSocket) -> None:
    """
    Unified control channel:
    - accepts DEVICE_PAIR to trigger the connection animation lifecycle
    - accepts legacy SYNC_STATE
    - accepts v2 WIDGETS_SYNC envelope
    - broadcasts camera/status events to all control clients
    """
    await websocket.accept()
    control_registry.connect(websocket)
    try:
        while True:
            try:
                raw: Dict[str, Any] = await websocket.receive_json()
            except WebSocketDisconnect:
                raise
            except Exception as exc:  # noqa: BLE001
                logger.warning("ws_control: failed to receive/parse frame: %s", exc)
                continue
            raw_type = str(raw.get("type") or "").strip().upper()

            # ── Device pairing handshake ──
            if raw_type == "DEVICE_PAIR":
                pair_payload = raw.get("payload", {})
                device_id = str(pair_payload.get("device_id", "unknown"))
                display_name = pair_payload.get("display_name")
                session_id = raw.get("sessionId")

                _paired_sockets[websocket] = device_id
                asyncio.create_task(
                    device_connection.pair_lifecycle(
                        device_id,
                        display_name=display_name,
                        session_id=session_id,
                    )
                )
                continue

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
                mirror_id, user_id = _resolve_mirror_context_from_websocket(db, websocket)
                updates = widget_service.updates_from_sync_state(db, mirror_id, user_id, sync)
                widget_service.replace_widgets(db, mirror_id, user_id, updates)
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
                logger.exception("ws_control: error processing WIDGETS_SYNC")
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
    except Exception:
        logger.exception("ws_control: unexpected error, connection dropped")
    finally:
        control_registry.disconnect(websocket)

        paired_device_id = _paired_sockets.pop(websocket, None)
        if paired_device_id and device_connection.active_device_id == paired_device_id:
            await device_connection.disconnect(device_id=paired_device_id, reason="socket closed")
            await device_connection.reset_to_idle()


# -- Device connection dev endpoints -----------------------------------------


@router.get("/api/device/status")
async def device_status() -> Any:
    return device_connection.snapshot()


@router.post("/api/dev/device/simulate")
async def dev_device_simulate(
    device_id: str = "dev-phone-01",
    display_name: str = "Dev Phone",
    fail: bool = False,
    session_id: str | None = None,
) -> Any:
    """Walk through the full SEARCHING -> CONNECTING -> CONNECTED (or ERROR) lifecycle."""
    if os.getenv("ENABLE_DEV_ENDPOINTS", "false").lower() != "true":
        return JSONResponse(status_code=404, content={"detail": "Not Found"})
    asyncio.create_task(
        device_connection.simulate_lifecycle(
            device_id, display_name=display_name, session_id=session_id, fail=fail
        )
    )
    return {"status": "ok", "fail": fail}


@router.post("/api/dev/device/search")
async def dev_device_search(session_id: str | None = None) -> Any:
    if os.getenv("ENABLE_DEV_ENDPOINTS", "false").lower() != "true":
        return JSONResponse(status_code=404, content={"detail": "Not Found"})
    return await device_connection.start_search(session_id=session_id, initiator="dev")


@router.post("/api/dev/device/connect")
async def dev_device_connect(
    device_id: str = "dev-phone-01",
    display_name: str = "Dev Phone",
    session_id: str | None = None,
) -> Any:
    if os.getenv("ENABLE_DEV_ENDPOINTS", "false").lower() != "true":
        return JSONResponse(status_code=404, content={"detail": "Not Found"})
    await device_connection.begin_connecting(device_id, display_name=display_name, session_id=session_id)
    await asyncio.sleep(1.5)
    return await device_connection.confirm_connected(device_id, display_name=display_name, session_id=session_id)


@router.post("/api/dev/device/error")
async def dev_device_error(
    message: str = "Connection lost",
    device_id: str | None = None,
    code: str | None = None,
    session_id: str | None = None,
) -> Any:
    if os.getenv("ENABLE_DEV_ENDPOINTS", "false").lower() != "true":
        return JSONResponse(status_code=404, content={"detail": "Not Found"})
    return await device_connection.report_error(message, device_id=device_id, code=code, session_id=session_id)


@router.post("/api/dev/device/disconnect")
async def dev_device_disconnect(session_id: str | None = None) -> Any:
    if os.getenv("ENABLE_DEV_ENDPOINTS", "false").lower() != "true":
        return JSONResponse(status_code=404, content={"detail": "Not Found"})
    result = await device_connection.disconnect(session_id=session_id)
    await device_connection.reset_to_idle(session_id=session_id)
    return result

