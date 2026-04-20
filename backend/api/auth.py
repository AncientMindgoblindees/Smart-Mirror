"""
Auth API router — device-code login/logout for Google and Microsoft.
"""

from __future__ import annotations

import logging
import os
from typing import Any, List

from fastapi import APIRouter, HTTPException, Request

from backend.schemas.auth import AuthStatusOut, DeviceCodeOut, ProviderStatusOut
from backend.services.auth_manager import auth_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/providers", response_model=List[ProviderStatusOut])
async def list_providers() -> Any:
    return auth_manager.get_connected_providers()


@router.post("/login/{provider}", response_model=DeviceCodeOut)
async def start_login(provider: str, request: Request) -> Any:
    if provider not in auth_manager.supported_providers:
        raise HTTPException(status_code=400, detail=f"Unsupported provider: {provider}")
    try:
        if provider == "google":
            configured_base = os.getenv("OAUTH_PUBLIC_BASE_URL", "").strip()
            base = configured_base or str(request.base_url).rstrip("/")
            start_url = f"{base}/api/oauth/google/start?source=qr"
            dc = await auth_manager.start_web_redirect_login("google", start_url)
        else:
            dc = await auth_manager.start_login(provider)
    except Exception as exc:
        logger.exception("Failed to start login for %s", provider)
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return DeviceCodeOut(
        provider=provider,
        verification_uri=dc.verification_uri,
        user_code=dc.user_code,
        expires_in=dc.expires_in,
        interval=dc.interval,
        message=dc.message,
    )


@router.get("/login/{provider}/status", response_model=AuthStatusOut)
async def login_status(provider: str) -> Any:
    if provider not in auth_manager.supported_providers:
        raise HTTPException(status_code=400, detail=f"Unsupported provider: {provider}")
    return auth_manager.get_login_status(provider)


@router.post("/login/{provider}/cancel")
async def cancel_login(provider: str) -> Any:
    if provider not in auth_manager.supported_providers:
        raise HTTPException(status_code=400, detail=f"Unsupported provider: {provider}")
    auth_manager.cancel_login(provider)
    return {"status": "ok", "provider": provider}


@router.delete("/logout/{provider}")
async def logout(provider: str) -> Any:
    if provider not in auth_manager.supported_providers:
        raise HTTPException(status_code=400, detail=f"Unsupported provider: {provider}")
    await auth_manager.logout(provider)
    return {"status": "ok", "provider": provider}
