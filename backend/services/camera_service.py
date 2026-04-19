import asyncio
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional
from uuid import uuid4

from sqlalchemy.orm import Session

from backend.database.session import SessionLocal
from backend.services.person_image_service import (
    LATEST_PERSON_IMAGE_PATH,
    clear_person_images,
    set_latest_person_image_path,
)
from backend import config
from backend.services.native_countdown_overlay import native_countdown_overlay
from backend.services.pi_camera import pi_camera
from backend.services.realtime import control_registry


class CameraCaptureState:
    def __init__(self) -> None:
        self.active = False
        self.booting = False
        self.countdown_remaining = 0
        self.last_capture_id: Optional[str] = None
        self.last_capture_at: Optional[datetime] = None
        self._task: Optional[asyncio.Task[None]] = None

    def as_dict(self) -> Dict[str, Any]:
        return {
            "active": self.active,
            "booting": self.booting,
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
        self.booting = True
        native_preview_started = False
        try:
            native_countdown_overlay.hide()
            capture_t0 = time.monotonic()
            await control_registry.broadcast(
                {
                    "type": "CAMERA_LOADING_STARTED",
                    "version": 2,
                    "sessionId": session_id,
                    "timestamp": datetime.utcnow().isoformat(),
                    "payload": {"source": source},
                }
            )
            if config.CAMERA_NATIVE_PREVIEW:
                native_preview_started = await asyncio.to_thread(pi_camera.start_native_preview)
                if not native_preview_started:
                    raise RuntimeError("Native camera preview failed to start")
            else:
                await asyncio.to_thread(pi_camera.prepare_for_capture)
            await control_registry.broadcast(
                {
                    "type": "CAMERA_LOADING_READY",
                    "version": 2,
                    "sessionId": session_id,
                    "timestamp": datetime.utcnow().isoformat(),
                    "payload": {"source": source},
                }
            )
            elapsed = time.monotonic() - capture_t0
            boot_remaining = float(config.CAMERA_MIN_BOOT_BEFORE_COUNTDOWN_SEC) - elapsed
            if boot_remaining > 0:
                await asyncio.sleep(boot_remaining)
            self.booting = False
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
            native_countdown_overlay.show_value(countdown_seconds)
            for remaining in range(countdown_seconds, 0, -1):
                self.countdown_remaining = remaining
                native_countdown_overlay.show_value(remaining)
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
            if native_preview_started:
                await asyncio.to_thread(pi_camera.stop_native_preview)
                native_preview_started = False
                await asyncio.sleep(0.12)
            native_countdown_overlay.hide()
            await asyncio.to_thread(pi_camera.capture_to, Path(LATEST_PERSON_IMAGE_PATH))
            db: Session = SessionLocal()
            try:
                set_latest_person_image_path(db, Path(LATEST_PERSON_IMAGE_PATH), status="captured")
            finally:
                db.close()
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
            native_countdown_overlay.hide()
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
            native_countdown_overlay.hide()
            if native_preview_started:
                await asyncio.to_thread(pi_camera.stop_native_preview)
            self.active = False
            self.booting = False
            self.countdown_remaining = 0
            self._task = None

    async def read_mjpeg_frame(self) -> bytes:
        """One lores JPEG frame for the MJPEG live stream only. Final photo uses capture_to after countdown."""
        return await asyncio.to_thread(pi_camera.capture_preview_bytes)

    def clear_state(self) -> None:
        self.active = False
        self.booting = False
        self.countdown_remaining = 0
        self.last_capture_id = None
        self.last_capture_at = None

    async def reset_person_image_state(self) -> None:
        db: Session = SessionLocal()
        try:
            clear_person_images(db)
        finally:
            db.close()
        self.clear_state()

    async def shutdown(self) -> None:
        if self._task is not None and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except BaseException:
                pass
        self._task = None
        self.clear_state()
        native_countdown_overlay.stop()
        await asyncio.to_thread(pi_camera.close)


camera_state = CameraCaptureState()
