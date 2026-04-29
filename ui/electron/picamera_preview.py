#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path


def main() -> int:
    if len(sys.argv) < 2:
        print("missing output path", file=sys.stderr)
        return 2
    out = Path(sys.argv[1])
    out.parent.mkdir(parents=True, exist_ok=True)

    width = int(sys.argv[2]) if len(sys.argv) > 2 else 640
    height = int(sys.argv[3]) if len(sys.argv) > 3 else 360

    try:
        from picamera2 import Picamera2  # type: ignore
    except Exception as exc:
        print(f"picamera2 import failed: {exc}", file=sys.stderr)
        return 3

    cam = Picamera2()
    try:
        cfg = cam.create_still_configuration(main={"size": (width, height)})
        cam.configure(cfg)
        cam.start()
        cam.capture_file(str(out))
    finally:
        try:
            cam.stop()
        except Exception:
            pass
        try:
            cam.close()
        except Exception:
            pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
