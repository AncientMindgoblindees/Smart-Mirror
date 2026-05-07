import os

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend import config
from backend.services.system_power import request_pi_shutdown

router = APIRouter(prefix="/system", tags=["system"])


class PowerOffRequest(BaseModel):
    source: str = "mirror-menu"


@router.post("/poweroff", summary="Request host shutdown for the mirror runtime")
def post_poweroff(payload: PowerOffRequest) -> dict[str, object]:
    requested = request_pi_shutdown(payload.source)
    if not requested:
        if not config.ALLOW_PI_SHUTDOWN_BUTTON:
            raise HTTPException(
                status_code=409,
                detail="Poweroff blocked: set ALLOW_PI_SHUTDOWN_BUTTON=1 and restart backend",
            )
        if os.name != "posix":
            raise HTTPException(
                status_code=409,
                detail="Poweroff blocked: unsupported platform (requires Linux/Pi runtime)",
            )
        raise HTTPException(
            status_code=409,
            detail="Poweroff request was blocked (command policy) or failed during launch",
        )
    return {"status": "ok", "requested": True, "source": payload.source}
