from fastapi import APIRouter, HTTPException

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
