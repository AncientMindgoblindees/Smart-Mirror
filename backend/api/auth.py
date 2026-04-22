from __future__ import annotations

import logging
from typing import Any, List

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from backend.config import get_oauth_public_base_url
from backend.database.session import get_db
from backend.schemas.auth import AuthStatusOut, DeviceCodeOut, ProviderStatusOut
from backend.services.auth_manager import auth_manager
from backend.services import user_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/providers", response_model=List[ProviderStatusOut])
async def list_providers(
    hardware_id: str = Query(...),
    user_id: str = Query(...),
    db: Session = Depends(get_db),
) -> Any:
    mirror = user_service.get_mirror_by_hardware_id(db, hardware_id)
    if mirror is None:
        raise HTTPException(status_code=404, detail="Mirror is not registered")
    return auth_manager.get_connected_providers(mirror.id, user_id)


@router.post("/login/{provider}", response_model=DeviceCodeOut)
async def start_login(
    provider: str,
    request: Request,
    hardware_id: str = Query(...),
    user_id: str = Query(...),
    db: Session = Depends(get_db),
) -> Any:
    if provider != "google":
        raise HTTPException(status_code=400, detail="Only Google OAuth is supported")

    mirror = user_service.get_mirror_by_hardware_id(db, hardware_id)
    if mirror is None:
        raise HTTPException(status_code=404, detail="Mirror is not registered")

    base = get_oauth_public_base_url(str(request.base_url))
    start_url = (
        f"{base}/api/oauth/google/start?source=qr"
        f"&hardware_id={mirror.hardware_id}&user_id={user_id}"
    )
    try:
        payload = await auth_manager.start_web_redirect_login(
            "google",
            start_url,
            mirror.id,
            user_id,
        )
    except Exception as exc:
        logger.exception("Failed to start login for Google")
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return DeviceCodeOut(**payload)


@router.get("/login/{provider}/status", response_model=AuthStatusOut)
async def login_status(
    provider: str,
    hardware_id: str = Query(...),
    user_id: str = Query(...),
    db: Session = Depends(get_db),
) -> Any:
    if provider != "google":
        raise HTTPException(status_code=400, detail="Only Google OAuth is supported")
    mirror = user_service.get_mirror_by_hardware_id(db, hardware_id)
    if mirror is None:
        raise HTTPException(status_code=404, detail="Mirror is not registered")
    return auth_manager.get_login_status(provider, mirror.id, user_id)


@router.post("/login/{provider}/cancel")
async def cancel_login(
    provider: str,
    hardware_id: str = Query(...),
    user_id: str = Query(...),
    db: Session = Depends(get_db),
) -> Any:
    if provider != "google":
        raise HTTPException(status_code=400, detail="Only Google OAuth is supported")
    mirror = user_service.get_mirror_by_hardware_id(db, hardware_id)
    if mirror is None:
        raise HTTPException(status_code=404, detail="Mirror is not registered")
    auth_manager.cancel_login(provider, mirror.id, user_id)
    return {"status": "ok", "provider": provider}


@router.delete("/logout/{provider}")
async def logout(
    provider: str,
    hardware_id: str = Query(...),
    user_id: str = Query(...),
    db: Session = Depends(get_db),
) -> Any:
    if provider != "google":
        raise HTTPException(status_code=400, detail="Only Google OAuth is supported")
    mirror = user_service.get_mirror_by_hardware_id(db, hardware_id)
    if mirror is None:
        raise HTTPException(status_code=404, detail="Mirror is not registered")
    await auth_manager.logout(provider, mirror.id, user_id, revoke=True)
    return {"status": "ok", "provider": provider}
