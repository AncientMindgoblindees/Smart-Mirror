from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class CameraCaptureRequest(BaseModel):
    countdown_seconds: int = Field(3, ge=0, le=10)
    source: str = Field("mobile-companion", min_length=1, max_length=64)
    session_id: Optional[str] = Field(default=None, max_length=128)


class CameraStatusOut(BaseModel):
    active: bool
    booting: bool = Field(
        default=False,
        description="True while prepare + min boot dwell run; mirror UI should show boot overlay.",
    )
    countdown_remaining: int
    last_capture_id: Optional[str] = None
    last_capture_at: Optional[datetime] = None


class CameraWebRtcOfferIn(BaseModel):
    sdp: str = Field(..., min_length=1)
    type: str = Field(..., min_length=1)


class CameraWebRtcAnswerOut(BaseModel):
    sdp: str
    type: str
