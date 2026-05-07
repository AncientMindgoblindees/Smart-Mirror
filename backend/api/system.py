from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.services.system_power import request_pi_shutdown

router = APIRouter(prefix="/system", tags=["system"])


class PowerOffRequest(BaseModel):
    source: str = "mirror-menu"


@router.post("/poweroff", summary="Request host shutdown for the mirror runtime")
def post_poweroff(payload: PowerOffRequest) -> dict[str, object]:
    requested = request_pi_shutdown(payload.source)
    if not requested:
        raise HTTPException(status_code=409, detail="Poweroff request was blocked or failed")
    return {"status": "ok", "requested": True, "source": payload.source}
