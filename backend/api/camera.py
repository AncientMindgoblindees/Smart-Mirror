import asyncio

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from backend import config
from backend.schemas.camera import CameraCaptureRequest, CameraPreviewRequest, CameraStatusOut
from backend.services.camera_service import camera_state
from backend.services.native_countdown_overlay import native_countdown_overlay
from backend.services.pi_camera import PiCameraError, pi_camera

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


@router.post("/preview/start", summary="Start native camera preview (dev tools)")
async def post_camera_preview_start(req: CameraPreviewRequest) -> dict:
    if not config.CAMERA_NATIVE_PREVIEW:
        raise HTTPException(status_code=409, detail="CAMERA_NATIVE_PREVIEW is disabled")
    try:
        started = await asyncio.to_thread(pi_camera.start_native_preview)
    except PiCameraError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    native_countdown_overlay.hide()
    return {"status": "ok", "preview_running": bool(started), "source": req.source}


@router.post("/preview/stop", summary="Stop native camera preview (dev tools)")
async def post_camera_preview_stop(req: CameraPreviewRequest) -> dict:
    await asyncio.to_thread(pi_camera.stop_native_preview)
    native_countdown_overlay.hide()
    return {"status": "ok", "preview_running": False, "source": req.source}


_MJPEG_BOUNDARY = b"mjpegframe"


def _mjpeg_streaming_response() -> StreamingResponse:
    """Shared MJPEG body for `/live` and `/stream.mjpg` (same bytes, two URLs for proxy quirks)."""
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


@router.get(
    "/live",
    summary="MJPEG live view (preferred for mirror UI; no dotted path segment)",
)
async def get_camera_mjpeg_live() -> StreamingResponse:
    return _mjpeg_streaming_response()


@router.get(
    "/stream.mjpg",
    summary="MJPEG live view (alternate URL; same as /live)",
)
async def get_camera_mjpeg_stream() -> StreamingResponse:
    return _mjpeg_streaming_response()
