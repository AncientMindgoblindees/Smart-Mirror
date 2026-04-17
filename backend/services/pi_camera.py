from __future__ import annotations

import shutil
import subprocess
import threading
import time
from contextlib import contextmanager
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
        self._use_cli_fallback = False
        self._camera_init_error = ""

    def _ensure_camera(self):
        if self._use_cli_fallback:
            return None
        if self._camera is not None:
            return self._camera
        cam = None
        try:
            from picamera2 import Picamera2  # type: ignore
        except Exception as exc:  # noqa: BLE001
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
            if cam is not None:
                try:
                    cam.stop()
                    cam.close()
                except Exception:
                    pass
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
        holders_before = _camera_holders_snapshot()
        attempts = 4
        proc: subprocess.CompletedProcess[str] | None = None
        last_holders = holders_before
        for attempt in range(1, attempts + 1):
            proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
            if proc.returncode == 0:
                return
            combined = f"{proc.stderr}\n{proc.stdout}".lower()
            busy = "resource busy" in combined or "pipeline handler in use" in combined or "failed to acquire camera" in combined
            if not busy or attempt == attempts:
                break
            time.sleep(0.2 * (2 ** (attempt - 1)))
            last_holders = _camera_holders_snapshot()
        holders_after = _camera_holders_snapshot()
        assert proc is not None
        raise PiCameraError(
            f"rpicam-still failed ({proc.returncode}): "
            f"{proc.stderr.strip() or proc.stdout.strip()} | holders-before={holders_before} | holders-retry={last_holders} | holders-after={holders_after}"
        )

    def capture_to(self, target_path: Path) -> None:
        target_path.parent.mkdir(parents=True, exist_ok=True)
        with self._lock:
            with _interprocess_camera_lock():
                cam = self._ensure_camera()
                with NamedTemporaryFile(
                    suffix=target_path.suffix or ".jpg",
                    dir=str(target_path.parent),
                    delete=False,
                ) as tmp:
                    tmp_path = Path(tmp.name)
                try:
                    if cam is not None:
                        try:
                            cam.capture_file(str(tmp_path))
                        except Exception as exc:
                            raise PiCameraError(
                                f"picamera capture failed: {exc} | holders={_camera_holders_snapshot()}"
                            ) from exc
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
            with _interprocess_camera_lock():
                cam = self._ensure_camera()
                with NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
                    tmp_path = Path(tmp.name)
                try:
                    if cam is not None:
                        try:
                            cam.capture_file(str(tmp_path))
                        except Exception as exc:
                            raise PiCameraError(
                                f"picamera preview failed: {exc} | holders={_camera_holders_snapshot()}"
                            ) from exc
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


def _camera_holders_snapshot() -> str:
    cmds = [
        ["fuser", "-v", "/dev/video0"],
        ["fuser", "-v", "/dev/video1"],
        ["fuser", "-v", "/dev/media0"],
        ["fuser", "-v", "/dev/media2"],
        ["pgrep", "-a", "rpicam"],
        ["pgrep", "-a", "libcamera"],
        ["sh", "-lc", "ps -eo pid,cmd | grep -E 'uvicorn|backend.main|python.*smart-mirror' | grep -v grep"],
    ]
    out: list[str] = []
    for cmd in cmds:
        proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
        snippet = (proc.stdout or "") + (proc.stderr or "")
        if snippet.strip():
            out.append(f"{' '.join(cmd)} => {snippet.strip()}")
    if not out:
        return "no-holders-detected-or-fuser-unavailable"
    return " | ".join(out)
