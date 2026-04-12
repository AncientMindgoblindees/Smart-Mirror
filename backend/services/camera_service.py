import asyncio
from datetime import datetime
from typing import Any, Dict, Optional
from uuid import uuid4

from backend.services.realtime import control_registry


class CameraCaptureState:
    def __init__(self) -> None:
        self.active = False
        self.countdown_remaining = 0
        self.last_capture_id: Optional[str] = None
        self.last_capture_at: Optional[datetime] = None
        self._task: Optional[asyncio.Task[None]] = None

    def as_dict(self) -> Dict[str, Any]:
        return {
            "active": self.active,
            "countdown_remaining": self.countdown_remaining,
            "last_capture_id": self.last_capture_id,
            "last_capture_at": self.last_capture_at,
        }

    async def start_capture(
        self,
        countdown_seconds: int,
        source: str,
        session_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        if self.active:
            return {"accepted": False, "reason": "capture already active"}

        self.active = True
        self.countdown_remaining = countdown_seconds
        self._task = asyncio.create_task(
            self._run_capture(countdown_seconds=countdown_seconds, source=source, session_id=session_id)
        )
        return {"accepted": True}

    async def _run_capture(self, countdown_seconds: int, source: str, session_id: Optional[str]) -> None:
        try:
            await control_registry.broadcast(
                {
                    "type": "CAMERA_COUNTDOWN_STARTED",
                    "version": 2,
                    "sessionId": session_id,
                    "timestamp": datetime.utcnow().isoformat(),
                    "payload": {
                        "countdown_seconds": countdown_seconds,
                        "source": source,
                    },
                }
            )
            for remaining in range(countdown_seconds, 0, -1):
                self.countdown_remaining = remaining
                await control_registry.broadcast(
                    {
                        "type": "CAMERA_COUNTDOWN_TICK",
                        "version": 2,
                        "sessionId": session_id,
                        "timestamp": datetime.utcnow().isoformat(),
                        "payload": {
                            "remaining": remaining,
                        },
                    }
                )
                await asyncio.sleep(1)

            capture_id = f"capture-{uuid4().hex[:12]}"
            self.last_capture_id = capture_id
            self.last_capture_at = datetime.utcnow()
            self.countdown_remaining = 0
            await control_registry.broadcast(
                {
                    "type": "CAMERA_CAPTURED",
                    "version": 2,
                    "sessionId": session_id,
                    "timestamp": datetime.utcnow().isoformat(),
                    "payload": {
                        "capture_id": capture_id,
                        "captured_at": self.last_capture_at.isoformat(),
                    },
                }
            )
        except Exception as exc:  # noqa: BLE001
            await control_registry.broadcast(
                {
                    "type": "CAMERA_ERROR",
                    "version": 2,
                    "sessionId": session_id,
                    "timestamp": datetime.utcnow().isoformat(),
                    "payload": {"message": str(exc)},
                }
            )
        finally:
            self.active = False
            self.countdown_remaining = 0
            self._task = None


camera_state = CameraCaptureState()
