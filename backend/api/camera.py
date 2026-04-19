import asyncio

from aiortc import RTCPeerConnection, RTCSessionDescription
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from backend import config
from backend.schemas.camera import (
    CameraCaptureRequest,
    CameraStatusOut,
    CameraWebRtcAnswerOut,
    CameraWebRtcOfferIn,
)
from backend.services.camera_service import camera_state
from backend.services.camera_webrtc import PiCameraPreviewTrack

router = APIRouter(prefix="/camera", tags=["camera"])
_webrtc_peers: set[RTCPeerConnection] = set()


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


@router.post(
    "/webrtc/offer",
    response_model=CameraWebRtcAnswerOut,
    summary="Create WebRTC camera preview answer",
)
async def post_camera_webrtc_offer(payload: CameraWebRtcOfferIn) -> CameraWebRtcAnswerOut:
    pc = RTCPeerConnection()
    _webrtc_peers.add(pc)

    @pc.on("connectionstatechange")
    async def _on_state_change() -> None:  # pragma: no cover - callback from aiortc runtime
        if pc.connectionState in {"failed", "closed", "disconnected"}:
            await pc.close()
            _webrtc_peers.discard(pc)

    pc.addTrack(PiCameraPreviewTrack())

    await pc.setRemoteDescription(
        RTCSessionDescription(sdp=payload.sdp, type=payload.type)
    )
    answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    local = pc.localDescription
    if local is None:
        raise HTTPException(status_code=500, detail="WebRTC negotiation failed")

    return CameraWebRtcAnswerOut(sdp=local.sdp, type=local.type)
