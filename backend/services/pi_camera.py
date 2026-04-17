from __future__ import annotations

import shutil
import subprocess
import threading
from contextlib import contextmanager
from pathlib import Path
from tempfile import NamedTemporaryFile

from backend import config
from backend.services.debug_log import write_debug_log


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
        self._use_cli_fallback = False
        self._camera_init_error = ""

    def _ensure_camera(self):
        if self._use_cli_fallback:
            return None
        if self._camera is not None:
            return self._camera
        try:
            from picamera2 import Picamera2  # type: ignore
        except Exception as exc:  # noqa: BLE001
            # region agent log
            write_debug_log(
                run_id="baseline",
                hypothesis_id="H4",
                location="backend/services/pi_camera.py:31",
                message="picamera2 import failed",
                data={"error_type": type(exc).__name__, "error": str(exc)},
            )
            # endregion
            self._use_cli_fallback = True
            self._camera_init_error = str(exc)
            return None

        try:
            cam = Picamera2()
            still_cfg = cam.create_still_configuration(
                main={"size": (config.PI_CAMERA_CAPTURE_WIDTH, config.PI_CAMERA_CAPTURE_HEIGHT)}
            )
            cam.configure(still_cfg)
            cam.start()
        except Exception as exc:  # noqa: BLE001
            # region agent log
            write_debug_log(
                run_id="baseline",
                hypothesis_id="H5",
                location="backend/services/pi_camera.py:53",
                message="camera init failed",
                data={"error_type": type(exc).__name__, "error": str(exc)},
            )
            # endregion
            self._use_cli_fallback = True
            self._camera_init_error = str(exc)
            return None
        self._camera = cam
        return cam

    def _capture_with_rpicam_cli(self, target_path: Path, width: int, height: int) -> None:
        bin_name = shutil.which("rpicam-still")
        if not bin_name:
            raise PiCameraError(
                f"Picamera2 unavailable ({self._camera_init_error}) and rpicam-still not found on PATH."
            )
        cmd = [
            bin_name,
            "-n",
            "--immediate",
            "--width",
            str(width),
            "--height",
            str(height),
            "-o",
            str(target_path),
        ]
        # region agent log
        write_debug_log(
            run_id="post-fix",
            hypothesis_id="H5",
            location="backend/services/pi_camera.py:84",
            message="using rpicam-still fallback",
            data={"bin": bin_name, "width": width, "height": height},
        )
        # endregion
        with _interprocess_camera_lock():
            # region agent log
            write_debug_log(
                run_id="post-fix",
                hypothesis_id="H10",
                location="backend/services/pi_camera.py:96",
                message="acquired interprocess camera lock",
                data={},
            )
            # endregion
            proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
        if proc.returncode != 0:
            raise PiCameraError(
                f"rpicam-still failed ({proc.returncode}): {proc.stderr.strip() or proc.stdout.strip()}"
            )

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
                if cam is not None:
                    cam.capture_file(str(tmp_path))
                else:
                    self._capture_with_rpicam_cli(
                        tmp_path,
                        config.PI_CAMERA_CAPTURE_WIDTH,
                        config.PI_CAMERA_CAPTURE_HEIGHT,
                    )
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
                if cam is not None:
                    cam.capture_file(str(tmp_path))
                else:
                    self._capture_with_rpicam_cli(tmp_path, 640, 360)
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


@contextmanager
def _interprocess_camera_lock():
    lock_path = Path("/tmp/smart-mirror-camera.lock")
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    with lock_path.open("a+", encoding="utf-8") as fh:
        try:
            import fcntl  # type: ignore
        except Exception:
            yield
            return
        fcntl.flock(fh.fileno(), fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(fh.fileno(), fcntl.LOCK_UN)
