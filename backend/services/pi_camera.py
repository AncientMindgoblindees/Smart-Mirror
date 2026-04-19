from __future__ import annotations

import os
import shutil
import subprocess
import threading
import time
from contextlib import contextmanager
from pathlib import Path
from tempfile import NamedTemporaryFile

from backend import config
try:
    from PIL import Image, ImageOps
except Exception:  # noqa: BLE001
    Image = None  # type: ignore[assignment]
    ImageOps = None  # type: ignore[assignment]


class PiCameraError(RuntimeError):
    pass


def _lores_size_for_main(main_w: int, main_h: int, max_edge: int) -> tuple[int, int]:
    """Pick lores dimensions with same aspect as main; long edge capped at max_edge."""
    mw = max(1, int(main_w))
    mh = max(1, int(main_h))
    cap = max(32, int(max_edge))
    if mw >= mh:
        w = cap
        h = max(1, int(round(cap * mh / mw)))
    else:
        h = cap
        w = max(1, int(round(cap * mw / mh)))
    return w, h


def _picamera2_save_preview_jpeg(cam, tmp_path: Path) -> None:
    """
    Pull a fresh frame via capture_request (still pipeline can stale-cache capture_file).
    Prefer lores stream when configured for lighter preview JPEGs.
    """
    req = cam.capture_request()
    try:
        try:
            req.save("lores", str(tmp_path))
        except Exception:
            req.save("main", str(tmp_path))
    finally:
        req.release()


def _picamera2_save_main_jpeg(cam, tmp_path: Path) -> None:
    """Final still capture on main stream via capture_request."""
    req = cam.capture_request()
    try:
        req.save("main", str(tmp_path))
    finally:
        req.release()


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
        self._preview_proc: subprocess.Popen[str] | None = None

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
            width, height = _scaled_capture_dimensions(
                config.PI_CAMERA_CAPTURE_WIDTH,
                config.PI_CAMERA_CAPTURE_HEIGHT,
                config.PI_CAMERA_MAX_DIM,
            )
            lw, lh = _lores_size_for_main(width, height, config.PI_CAMERA_PREVIEW_LORES_MAX)
            try:
                still_cfg = cam.create_still_configuration(
                    main={"size": (width, height)},
                    lores={"size": (lw, lh)},
                )
            except Exception:
                still_cfg = cam.create_still_configuration(main={"size": (width, height)})
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
            "--quality",
            str(_clamped_jpeg_quality(config.PI_CAMERA_JPEG_QUALITY)),
            "-o",
            str(target_path),
        ]
        holders_before = _camera_holders_snapshot()
        attempts = 4
        proc: subprocess.CompletedProcess[str] | None = None
        last_holders = holders_before
        attempted_media_release = False
        media_release_note = "none"
        for attempt in range(1, attempts + 1):
            proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
            if proc.returncode == 0:
                return
            combined = f"{proc.stderr}\n{proc.stdout}".lower()
            busy = "resource busy" in combined or "pipeline handler in use" in combined or "failed to acquire camera" in combined
            if busy and not attempted_media_release and _holders_include_pipewire(last_holders):
                attempted_media_release = True
                if _should_auto_stop_pipewire():
                    stopped = _stop_pipewire_user_services()
                    media_release_note = f"auto_stop_pipewire={stopped}"
                else:
                    media_release_note = "pipewire_detected_auto_stop_disabled"
                time.sleep(0.25)
                last_holders = _camera_holders_snapshot()
            if not busy or attempt == attempts:
                break
            time.sleep(0.2 * (2 ** (attempt - 1)))
            last_holders = _camera_holders_snapshot()
        holders_after = _camera_holders_snapshot()
        assert proc is not None
        raise PiCameraError(
            f"rpicam-still failed ({proc.returncode}): "
            f"{proc.stderr.strip() or proc.stdout.strip()} | "
            f"media_release={media_release_note} | "
            f"{_format_holders('holders-before', holders_before)} | "
            f"{_format_holders('holders-retry', last_holders)} | "
            f"{_format_holders('holders-after', holders_after)}"
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
                            _picamera2_save_main_jpeg(cam, tmp_path)
                        except Exception as exc:
                            raise PiCameraError(
                                f"picamera capture failed: {exc} | "
                                f"{_format_holders('holders', _camera_holders_snapshot())}"
                            ) from exc
                    else:
                        width, height = _scaled_capture_dimensions(
                            config.PI_CAMERA_CAPTURE_WIDTH,
                            config.PI_CAMERA_CAPTURE_HEIGHT,
                            config.PI_CAMERA_MAX_DIM,
                        )
                        self._capture_with_rpicam_cli(
                            tmp_path,
                            width,
                            height,
                        )
                    _optimize_latest_person_image_for_transport(tmp_path, target_path)
                    tmp_path.replace(target_path)
                finally:
                    if tmp_path.exists():
                        tmp_path.unlink(missing_ok=True)

    def start_native_preview(self) -> bool:
        with self._lock:
            with _interprocess_camera_lock():
                if self._preview_proc is not None and self._preview_proc.poll() is None:
                    return True

                bin_name = shutil.which("rpicam-hello")
                if not bin_name:
                    raise PiCameraError("rpicam-hello not found on PATH")

                # Release Picamera2 handle before native preview claims camera.
                cam = self._camera
                self._camera = None
                if cam is not None:
                    try:
                        cam.stop()
                    except Exception:
                        pass
                    try:
                        cam.close()
                    except Exception:
                        pass

                width, height = _scaled_capture_dimensions(
                    config.PI_CAMERA_CAPTURE_WIDTH,
                    config.PI_CAMERA_CAPTURE_HEIGHT,
                    config.PI_CAMERA_MAX_DIM,
                )
                cmd = [
                    bin_name,
                    "-t",
                    "0",
                    "--fullscreen",
                    "--width",
                    str(width),
                    "--height",
                    str(height),
                ]
                self._preview_proc = subprocess.Popen(  # noqa: S603
                    cmd,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    text=True,
                )
                time.sleep(0.18)
                return self._preview_proc.poll() is None

    def stop_native_preview(self) -> None:
        with self._lock:
            proc = self._preview_proc
            self._preview_proc = None
            if proc is None:
                return
            if proc.poll() is not None:
                return
            proc.terminate()
            try:
                proc.wait(timeout=1.0)
            except Exception:
                proc.kill()
                try:
                    proc.wait(timeout=0.5)
                except Exception:
                    pass

    def prepare_for_capture(self) -> None:
        with self._lock:
            with _interprocess_camera_lock():
                cam = self._ensure_camera()
                if cam is not None:
                    try:
                        with NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
                            wtmp = Path(tmp.name)
                        try:
                            _picamera2_save_preview_jpeg(cam, wtmp)
                        finally:
                            wtmp.unlink(missing_ok=True)
                    except Exception:
                        pass
                    return
                with NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
                    tmp_path = Path(tmp.name)
                try:
                    width, height = _scaled_capture_dimensions(
                        config.PI_CAMERA_CAPTURE_WIDTH,
                        config.PI_CAMERA_CAPTURE_HEIGHT,
                        config.PI_CAMERA_MAX_DIM,
                    )
                    pw, ph = _lores_size_for_main(width, height, config.PI_CAMERA_PREVIEW_LORES_MAX)
                    self._capture_with_rpicam_cli(tmp_path, pw, ph)
                finally:
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
                            _picamera2_save_preview_jpeg(cam, tmp_path)
                        except Exception as exc:
                            raise PiCameraError(
                                f"picamera preview failed: {exc} | "
                                f"{_format_holders('holders', _camera_holders_snapshot())}"
                            ) from exc
                    else:
                        width, height = _scaled_capture_dimensions(
                            config.PI_CAMERA_CAPTURE_WIDTH,
                            config.PI_CAMERA_CAPTURE_HEIGHT,
                            config.PI_CAMERA_MAX_DIM,
                        )
                        pw, ph = _lores_size_for_main(width, height, config.PI_CAMERA_PREVIEW_LORES_MAX)
                        self._capture_with_rpicam_cli(tmp_path, pw, ph)
                    return tmp_path.read_bytes()
                finally:
                    tmp_path.unlink(missing_ok=True)

    def close(self) -> None:
        with self._lock:
            proc = self._preview_proc
            self._preview_proc = None
            if proc is not None and proc.poll() is None:
                proc.terminate()
                try:
                    proc.wait(timeout=1.0)
                except Exception:
                    proc.kill()
                    try:
                        proc.wait(timeout=0.5)
                    except Exception:
                        pass

            cam = self._camera
            self._camera = None
            if cam is None:
                return
            try:
                cam.stop()
            except Exception:
                pass
            try:
                cam.close()
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


def _camera_holders_snapshot() -> dict[str, str]:
    cmds = [
        ["fuser", "-v", "/dev/video0"],
        ["fuser", "-v", "/dev/video1"],
        ["fuser", "-v", "/dev/media0"],
        ["fuser", "-v", "/dev/media2"],
        ["pgrep", "-a", "rpicam"],
        ["pgrep", "-a", "libcamera"],
        ["sh", "-lc", "ps -eo pid,cmd | grep -E 'uvicorn|backend.main|python.*smart-mirror' | grep -v grep"],
    ]
    media: list[str] = []
    backend: list[str] = []
    other: list[str] = []
    for cmd in cmds:
        proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
        snippet = (proc.stdout or "") + (proc.stderr or "")
        if snippet.strip():
            entry = f"{' '.join(cmd)} => {snippet.strip()}"
            joined = " ".join(cmd)
            if "/dev/media" in joined or "/dev/video" in joined:
                media.append(entry)
            elif "uvicorn" in joined or "backend.main" in joined:
                backend.append(entry)
            else:
                other.append(entry)
    return {
        "media": " || ".join(media) if media else "none",
        "backend": " || ".join(backend) if backend else "none",
        "other": " || ".join(other) if other else "none",
    }


def _format_holders(prefix: str, snapshot: dict[str, str]) -> str:
    return (
        f"{prefix}.holders_media={snapshot.get('media', 'none')} "
        f"{prefix}.holders_backend={snapshot.get('backend', 'none')} "
        f"{prefix}.holders_other={snapshot.get('other', 'none')}"
    )


def _holders_include_pipewire(snapshot: dict[str, str]) -> bool:
    media = (snapshot.get("media") or "").lower()
    return "pipewire" in media or "wireplumber" in media


def _should_auto_stop_pipewire() -> bool:
    flag = (os.getenv("MIRROR_CAMERA_AUTO_STOP_PIPEWIRE", "1") or "1").strip().lower()
    return flag in {"1", "true", "yes", "on"}


def _stop_pipewire_user_services() -> bool:
    cmd = ["systemctl", "--user", "stop", "pipewire", "pipewire-pulse", "wireplumber"]
    proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
    return proc.returncode == 0


def _clamped_jpeg_quality(value: int) -> int:
    return max(20, min(95, int(value)))


def _scaled_capture_dimensions(width: int, height: int, max_dim: int) -> tuple[int, int]:
    width = max(1, int(width))
    height = max(1, int(height))
    max_dim = int(max_dim)
    largest = max(width, height)
    if max_dim <= 0 or largest <= max_dim:
        return width, height
    scale = max_dim / largest
    return max(1, int(width * scale)), max(1, int(height * scale))


def _optimize_latest_person_image_for_transport(tmp_path: Path, target_path: Path) -> None:
    if target_path.name != "latest_person.jpg" or Image is None or ImageOps is None:
        return
    quality = _clamped_jpeg_quality(config.PI_CAMERA_JPEG_QUALITY)
    max_dim = int(config.PI_CAMERA_MAX_DIM)
    with Image.open(tmp_path) as img:
        processed = ImageOps.exif_transpose(img)
        if max_dim > 0:
            processed.thumbnail((max_dim, max_dim), Image.Resampling.LANCZOS)
        if processed.mode not in ("RGB", "L"):
            processed = processed.convert("RGB")
        processed.save(tmp_path, format="JPEG", quality=quality, optimize=True)
