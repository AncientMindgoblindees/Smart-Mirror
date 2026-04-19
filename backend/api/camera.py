import asyncio

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from backend import config
from backend.schemas.camera import CameraCaptureRequest, CameraStatusOut
from backend.services.camera_service import camera_state

router = APIRouter(prefix="/camera", tags=["camera"])


@router.get("/status", response_model=CameraStatusOut, summary="Get capture status")
async def get_camera_status() -> CameraStatusOut:
    return CameraStatusOut(**camera_state.as_dict())


@router.post("/capture", summary="Trigger mirror camera countdown and capture")
async def post_camera_capture(req: CameraCaptureRequest) -> dict:
    result = await camera_state.start_capture(
        countdown_seconds=req.countdown_seconds,
        source=req.source,
        session_id=req.session_id,
    )
    if not result.get("accepted"):
        raise HTTPException(status_code=409, detail=result.get("reason", "capture busy"))
    return {"status": "accepted"}


_MJPEG_BOUNDARY = b"mjpegframe"


@router.get(
    "/stream.mjpg",
    summary="MJPEG preview stream (multipart) for browser <img> live view",
)
async def get_camera_mjpeg_stream() -> StreamingResponse:
    """
    One long-lived HTTP response; the browser decodes multipart JPEG parts as a live feed.
    """

    pause = 1.0 / max(1.0, float(config.CAMERA_MJPEG_MAX_FPS))

    async def frames():
        while True:
            try:
                chunk = await camera_state.read_mjpeg_frame()
            except asyncio.CancelledError:
                raise
            except Exception:
                await asyncio.sleep(0.35)
                continue
            yield b"--" + _MJPEG_BOUNDARY + b"\r\nContent-Type: image/jpeg\r\n\r\n" + chunk + b"\r\n"
            await asyncio.sleep(pause)

    return StreamingResponse(
        frames(),
        media_type="multipart/x-mixed-replace; boundary=mjpegframe",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
