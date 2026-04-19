from __future__ import annotations

import json
import subprocess
import sys
import time
from pathlib import Path

from backend import config


class NativeCountdownOverlay:
    def __init__(self) -> None:
        self._proc: subprocess.Popen[str] | None = None
        self._state_path = Path("/tmp/smart-mirror-countdown-overlay.json")

    def _script_path(self) -> Path:
        return Path(__file__).resolve().parent.parent / "tools" / "native_countdown_overlay.py"

    def _write_state(self, visible: bool, value: int | None = None, label: str = "Photo in") -> None:
        payload: dict[str, object] = {
            "visible": bool(visible),
            "label": str(label),
            "updated_at": float(time.monotonic()),
        }
        if value is not None:
            payload["value"] = int(value)
        self._state_path.parent.mkdir(parents=True, exist_ok=True)
        self._state_path.write_text(json.dumps(payload), encoding="utf-8")

    def ensure_running(self) -> None:
        if not config.CAMERA_NATIVE_COUNTDOWN_OVERLAY:
            return
        if self._proc is not None and self._proc.poll() is None:
            return
        script = self._script_path()
        if not script.exists():
            return
        self._proc = subprocess.Popen(  # noqa: S603
            [
                sys.executable,
                str(script),
                "--state-file",
                str(self._state_path),
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            text=True,
        )

    def show_value(self, value: int, label: str = "Photo in") -> None:
        if not config.CAMERA_NATIVE_COUNTDOWN_OVERLAY:
            return
        self.ensure_running()
        self._write_state(True, value=value, label=label)

    def hide(self) -> None:
        if not config.CAMERA_NATIVE_COUNTDOWN_OVERLAY:
            return
        self._write_state(False)

    def stop(self) -> None:
        self.hide()
        proc = self._proc
        self._proc = None
        if proc is None:
            return
        if proc.poll() is not None:
            return
        proc.terminate()
        try:
            proc.wait(timeout=0.7)
        except Exception:
            proc.kill()
            try:
                proc.wait(timeout=0.3)
            except Exception:
                pass


native_countdown_overlay = NativeCountdownOverlay()
