import asyncio

from fastapi import APIRouter, HTTPException, Response
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
    Avoids hundreds of separate /preview.jpg requests that abort each other on slow hardware.
    """

    pause = 1.0 / max(1.0, float(config.CAMERA_MJPEG_MAX_FPS))

    async def frames():
        while True:
            try:
                chunk = await camera_state.capture_preview_bytes()
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


@router.get("/preview.jpg", summary="Fetch a single live preview frame from Pi camera")
async def get_camera_preview() -> Response:
    try:
        data = await camera_state.capture_preview_bytes()
    except Exception as exc:  # noqa: BLE001
        detail = str(exc)
        code = "CAMERA_PREVIEW_UNAVAILABLE"
        lowered = detail.lower()
        if "resource busy" in lowered or "pipeline handler in use" in lowered or "failed to acquire camera" in lowered:
            code = "CAMERA_BUSY_EXTERNAL_OWNER"
        raise HTTPException(
            status_code=503,
            detail={
                "code": code,
                "message": "Preview unavailable",
                "detail": detail[:1500],
            },
        ) from exc
    return Response(content=data, media_type="image/jpeg", headers={"Cache-Control": "no-store"})
