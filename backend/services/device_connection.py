import asyncio
import logging
from datetime import datetime
from enum import Enum
from typing import Any, Dict, Optional

from backend.services.realtime import control_registry

logger = logging.getLogger(__name__)


class DeviceState(str, Enum):
    IDLE = "idle"
    SEARCHING = "searching"
    CONNECTING = "connecting"
    CONNECTED = "connected"
    ERROR = "error"


class DeviceConnectionManager:
    """
    Single-device connection authority.  Only one device may be active at a
    time.  Transitions broadcast v2 control events so every connected UI
    client stays synchronised.
    """

    def __init__(self) -> None:
        self.state: DeviceState = DeviceState.IDLE
        self.active_device_id: Optional[str] = None
        self.active_device_name: Optional[str] = None
        self.last_error: Optional[str] = None

    def snapshot(self) -> Dict[str, Any]:
        return {
            "state": self.state.value,
            "active_device_id": self.active_device_id,
            "active_device_name": self.active_device_name,
            "last_error": self.last_error,
        }

    # -- envelope helper -----------------------------------------------------

    @staticmethod
    def _envelope(event_type: str, payload: Dict[str, Any], session_id: Optional[str] = None) -> Dict[str, Any]:
        return {
            "type": event_type,
            "version": 2,
            "sessionId": session_id,
            "timestamp": datetime.utcnow().isoformat(),
            "payload": payload,
        }

    # -- public transition API -----------------------------------------------

    async def start_search(self, *, session_id: Optional[str] = None, initiator: str = "user") -> Dict[str, Any]:
        if self.state == DeviceState.SEARCHING:
            return {"accepted": False, "reason": "already searching"}

        if self.state == DeviceState.CONNECTED and self.active_device_id:
            await self._graceful_disconnect(session_id=session_id, reason="new search initiated")

        self.state = DeviceState.SEARCHING
        self.last_error = None
        await control_registry.broadcast(
            self._envelope("DEVICE_SEARCHING", {"initiator": initiator}, session_id)
        )
        return {"accepted": True}

    async def begin_connecting(
        self,
        device_id: str,
        *,
        display_name: Optional[str] = None,
        session_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        if self.state == DeviceState.CONNECTED and self.active_device_id:
            await self._graceful_disconnect(session_id=session_id, reason="replacing with new device")

        self.state = DeviceState.CONNECTING
        self.last_error = None
        await control_registry.broadcast(
            self._envelope(
                "DEVICE_CONNECTING",
                {"device_id": device_id, "display_name": display_name},
                session_id,
            )
        )
        return {"accepted": True}

    async def confirm_connected(
        self,
        device_id: str,
        *,
        display_name: Optional[str] = None,
        session_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        self.state = DeviceState.CONNECTED
        self.active_device_id = device_id
        self.active_device_name = display_name
        self.last_error = None
        await control_registry.broadcast(
            self._envelope(
                "DEVICE_CONNECTED",
                {"device_id": device_id, "display_name": display_name},
                session_id,
            )
        )
        return {"accepted": True}

    async def report_error(
        self,
        message: str,
        *,
        device_id: Optional[str] = None,
        code: Optional[str] = None,
        session_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        self.state = DeviceState.ERROR
        self.last_error = message
        await control_registry.broadcast(
            self._envelope(
                "DEVICE_ERROR",
                {"device_id": device_id, "message": message, "code": code},
                session_id,
            )
        )
        return {"accepted": True}

    async def disconnect(
        self,
        *,
        device_id: Optional[str] = None,
        session_id: Optional[str] = None,
        reason: Optional[str] = None,
    ) -> Dict[str, Any]:
        target = device_id or self.active_device_id
        if not target:
            return {"accepted": False, "reason": "no device to disconnect"}
        await self._graceful_disconnect(session_id=session_id, reason=reason)
        return {"accepted": True}

    async def reset_to_idle(self, *, session_id: Optional[str] = None) -> None:
        self.state = DeviceState.IDLE
        self.active_device_id = None
        self.active_device_name = None
        self.last_error = None

    # -- pairing lifecycle (real companion handshake) -------------------------

    async def pair_lifecycle(
        self,
        device_id: str,
        *,
        display_name: Optional[str] = None,
        session_id: Optional[str] = None,
    ) -> None:
        """
        Full SEARCHING -> CONNECTING -> CONNECTED flow triggered by a real
        companion DEVICE_PAIR message.  Durations give the mirror UI enough
        time to play each cinematic animation stage.
        """
        try:
            await self.start_search(session_id=session_id, initiator="companion")
            await asyncio.sleep(1.8)

            await self.begin_connecting(device_id, display_name=display_name, session_id=session_id)
            await asyncio.sleep(1.5)

            await self.confirm_connected(device_id, display_name=display_name, session_id=session_id)
        except Exception as exc:
            logger.exception("pair_lifecycle failed for %s", device_id)
            await self.report_error(
                str(exc),
                device_id=device_id,
                code="PAIR_FAIL",
                session_id=session_id,
            )

    # -- simulated full lifecycle for dev testing ----------------------------

    async def simulate_lifecycle(
        self,
        device_id: str,
        *,
        display_name: Optional[str] = None,
        session_id: Optional[str] = None,
        fail: bool = False,
    ) -> None:
        """Walk through SEARCHING -> CONNECTING -> CONNECTED (or ERROR)."""
        await self.start_search(session_id=session_id, initiator="dev-simulate")
        await asyncio.sleep(2.0)

        await self.begin_connecting(device_id, display_name=display_name, session_id=session_id)
        await asyncio.sleep(1.5)

        if fail:
            await self.report_error(
                "Simulated connection failure",
                device_id=device_id,
                code="SIM_FAIL",
                session_id=session_id,
            )
        else:
            await self.confirm_connected(device_id, display_name=display_name, session_id=session_id)

    # -- internal helpers ----------------------------------------------------

    async def _graceful_disconnect(self, *, session_id: Optional[str] = None, reason: Optional[str] = None) -> None:
        prev_id = self.active_device_id
        if not prev_id:
            return
        await control_registry.broadcast(
            self._envelope(
                "DEVICE_DISCONNECTING",
                {"device_id": prev_id, "reason": reason},
                session_id,
            )
        )
        await asyncio.sleep(0.3)
        self.active_device_id = None
        self.active_device_name = None
        await control_registry.broadcast(
            self._envelope("DEVICE_DISCONNECTED", {"device_id": prev_id}, session_id)
        )


device_connection = DeviceConnectionManager()
