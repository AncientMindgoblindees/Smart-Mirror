from __future__ import annotations

import threading
from pathlib import Path
from tempfile import NamedTemporaryFile

from backend import config


class PiCameraError(RuntimeError):
    pass


class PiCameraAdapter:
    """
    Thin Picamera2 adapter with thread-safe capture operations.
    Uses uncropped sensor framing to maximize visible body area.
    """

    def __init__(self) -> None:
        self._camera = None
        self._lock = threading.Lock()

    def _ensure_camera(self):
        if self._camera is not None:
            return self._camera
        try:
            from picamera2 import Picamera2  # type: ignore
        except Exception as exc:  # noqa: BLE001
            raise PiCameraError(
                "Pi camera library unavailable. Install Picamera2 on the Raspberry Pi."
            ) from exc

        cam = Picamera2()
        still_cfg = cam.create_still_configuration(
            main={"size": (config.PI_CAMERA_CAPTURE_WIDTH, config.PI_CAMERA_CAPTURE_HEIGHT)}
        )
        cam.configure(still_cfg)
        cam.start()
        self._camera = cam
        return cam

    def capture_to(self, target_path: Path) -> None:
        target_path.parent.mkdir(parents=True, exist_ok=True)
        with self._lock:
            cam = self._ensure_camera()
            with NamedTemporaryFile(
                suffix=target_path.suffix or ".jpg",
                dir=str(target_path.parent),
                delete=False,
            ) as tmp:
                tmp_path = Path(tmp.name)
            try:
                cam.capture_file(str(tmp_path))
                tmp_path.replace(target_path)
            finally:
                if tmp_path.exists():
                    tmp_path.unlink(missing_ok=True)

    def capture_preview_bytes(self) -> bytes:
        with self._lock:
            cam = self._ensure_camera()
            with NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
                tmp_path = Path(tmp.name)
            try:
                cam.capture_file(str(tmp_path))
                return tmp_path.read_bytes()
            finally:
                tmp_path.unlink(missing_ok=True)

    def close(self) -> None:
        with self._lock:
            cam = self._camera
            self._camera = None
            if cam is None:
                return
            try:
                cam.stop()
            except Exception:
                pass


pi_camera = PiCameraAdapter()
