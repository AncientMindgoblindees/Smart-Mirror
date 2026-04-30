import asyncio
import logging
import os
from datetime import datetime
from typing import Any, Dict

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from starlette.websockets import WebSocketState

logger = logging.getLogger(__name__)

from backend.database.session import SessionLocal, get_db
from backend.api.security import require_api_token, require_websocket_token
from backend.schemas.mirror_sync_state import SyncStateInbound
from backend.services import button_service, user_service, widget_service
from backend.services.device_connection import device_connection
from backend.services.realtime import buttons_registry, control_registry
from hardware.gpio.config import ButtonId
from hardware.gpio.events import ButtonAction

router = APIRouter(tags=["events"])


@router.websocket("/ws/buttons")
async def ws_buttons(
    websocket: WebSocket,
    token: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> None:
    authorized = await require_websocket_token(websocket, token=token)
    if not authorized or websocket.client_state == WebSocketState.DISCONNECTED:
        return
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
async def dev_button_event(
    button_id: str,
    action: str,
    _auth: None = Depends(require_api_token),
) -> Any:
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


_paired_sockets: Dict[WebSocket, str] = {}


def _widget_row_to_dict(row: Any) -> Dict[str, Any]:
    return {
        "id": row.id,
        "widget_id": row.widget_id,
        "enabled": row.enabled,
        "position_row": row.position_row,
        "position_col": row.position_col,
        "size_rows": row.size_rows,
        "size_cols": row.size_cols,
        "config_json": row.config_json or {},
        "updated_at": row.updated_at.isoformat() if getattr(row, "updated_at", None) else None,
    }


def _build_mirror_state_snapshot(reason: str) -> Dict[str, Any]:
    db = SessionLocal()
    try:
        widgets = widget_service.get_all_widgets(db)
        settings = user_service.get_or_create_user_settings(db)
        return {
            "reason": reason,
            "layout_revision": widget_service.get_layout_revision(db),
            "widgets": [_widget_row_to_dict(row) for row in widgets],
            "settings": {
                "theme": settings.theme,
                "primary_font_size": settings.primary_font_size,
                "accent_color": settings.accent_color,
            },
            "device": device_connection.snapshot(),
        }
    finally:
        db.close()


async def _send_state_snapshot(
    websocket: WebSocket,
    *,
    reason: str,
    session_id: str | None = None,
) -> None:
    await websocket.send_json(
        {
            "type": "MIRROR_STATE_SNAPSHOT",
            "version": 2,
            "sessionId": session_id,
            "timestamp": datetime.utcnow().isoformat(),
            "payload": _build_mirror_state_snapshot(reason),
        }
    )


@router.websocket("/ws/control")
async def ws_control(
    websocket: WebSocket,
    token: str | None = Query(default=None),
) -> None:
    """
    Unified control channel:
    - accepts DEVICE_PAIR to trigger the connection animation lifecycle
    - accepts legacy SYNC_STATE
    - accepts v2 WIDGETS_SYNC envelope
    - broadcasts camera/status events to all control clients
    """
    authorized = await require_websocket_token(websocket, token=token)
    if not authorized or websocket.client_state == WebSocketState.DISCONNECTED:
        return
    await websocket.accept()
    control_registry.connect(websocket)
    try:
        await _send_state_snapshot(websocket, reason="ws_connected")
    except Exception as exc:  # noqa: BLE001
        logger.warning("ws_control: failed initial MIRROR_STATE_SNAPSHOT: %s", exc)
    try:
        while True:
            try:
                raw: Dict[str, Any] = await websocket.receive_json()
            except WebSocketDisconnect:
                raise
            except RuntimeError as exc:
                # Happens when socket was closed/rejected before accept; stop loop.
                if "not connected" in str(exc).lower() or "call \"accept\" first" in str(exc).lower():
                    logger.info("ws_control: socket closed before frame receive; ending connection loop")
                    break
                logger.warning("ws_control: runtime receive error: %s", exc)
                break
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
                try:
                    await _send_state_snapshot(
                        websocket,
                        reason="device_pair_received",
                        session_id=session_id,
                    )
                except Exception as exc:  # noqa: BLE001
                    logger.warning("ws_control: failed pair MIRROR_STATE_SNAPSHOT: %s", exc)
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
                snapshot_event = {
                    "type": "MIRROR_STATE_SNAPSHOT",
                    "version": 2,
                    "sessionId": raw.get("sessionId"),
                    "timestamp": datetime.utcnow().isoformat(),
                    "payload": _build_mirror_state_snapshot("widgets_sync_applied"),
                }
                await websocket.send_json(snapshot_event)
                await control_registry.broadcast(snapshot_event)
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
async def device_status(_auth: None = Depends(require_api_token)) -> Any:
    return device_connection.snapshot()


@router.post("/api/dev/device/simulate")
async def dev_device_simulate(
    device_id: str = "dev-phone-01",
    display_name: str = "Dev Phone",
    fail: bool = False,
    session_id: str | None = None,
    _auth: None = Depends(require_api_token),
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
async def dev_device_search(
    session_id: str | None = None,
    _auth: None = Depends(require_api_token),
) -> Any:
    if os.getenv("ENABLE_DEV_ENDPOINTS", "false").lower() != "true":
        return JSONResponse(status_code=404, content={"detail": "Not Found"})
    return await device_connection.start_search(session_id=session_id, initiator="dev")


@router.post("/api/dev/device/connect")
async def dev_device_connect(
    device_id: str = "dev-phone-01",
    display_name: str = "Dev Phone",
    session_id: str | None = None,
    _auth: None = Depends(require_api_token),
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
    _auth: None = Depends(require_api_token),
) -> Any:
    if os.getenv("ENABLE_DEV_ENDPOINTS", "false").lower() != "true":
        return JSONResponse(status_code=404, content={"detail": "Not Found"})
    return await device_connection.report_error(message, device_id=device_id, code=code, session_id=session_id)


@router.post("/api/dev/device/disconnect")
async def dev_device_disconnect(
    session_id: str | None = None,
    _auth: None = Depends(require_api_token),
) -> Any:
    if os.getenv("ENABLE_DEV_ENDPOINTS", "false").lower() != "true":
        return JSONResponse(status_code=404, content={"detail": "Not Found"})
    result = await device_connection.disconnect(session_id=session_id)
    await device_connection.reset_to_idle(session_id=session_id)
    return result

