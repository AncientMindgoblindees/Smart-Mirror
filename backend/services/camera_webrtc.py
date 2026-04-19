from __future__ import annotations

from fractions import Fraction
from io import BytesIO

import numpy as np
from aiortc import VideoStreamTrack
from av import VideoFrame
from PIL import Image

from backend.services.camera_service import camera_state


class PiCameraPreviewTrack(VideoStreamTrack):
    """
    WebRTC video track backed by backend camera preview frames.
    Keeps existing backend camera ownership model (browser never opens device).
    """

    kind = "video"

    def __init__(self) -> None:
        super().__init__()
        self._fallback_time_base = Fraction(1, 90000)

    async def recv(self) -> VideoFrame:
        try:
            pts, time_base = await self.next_timestamp()
        except Exception:
            pts, time_base = 0, self._fallback_time_base

        jpeg_bytes = await camera_state.read_mjpeg_frame()
        with Image.open(BytesIO(jpeg_bytes)) as img:
            rgb = img.convert("RGB")
            arr = np.array(rgb)

        frame = VideoFrame.from_ndarray(arr, format="rgb24")
        frame.pts = pts
        frame.time_base = time_base
        return frame
