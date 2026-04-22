from __future__ import annotations

import logging
import os
import secrets
import time
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session

from backend.config import get_oauth_public_base_url
from backend.database.models import Mirror, UserProfile
from backend.database.session import get_db
from backend.services import user_service
from backend.services.auth_manager import auth_manager
from backend.services.providers.base import TokenResponse
from backend.services.providers.google_provider import GOOGLE_WEB_SCOPES, get_google_web_oauth_credentials

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/oauth", tags=["oauth"])

STATE_TTL_SEC = 600.0
_pending_state: dict[str, tuple[str, float, str, str, str, str]] = {}

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"


def _cleanup_state() -> None:
    now = time.monotonic()
    dead = [key for key, (_, expiry, _, _, _, _) in _pending_state.items() if expiry < now]
    for key in dead:
        _pending_state.pop(key, None)


def _new_state(provider: str, source: str, mirror_id: str, user_id: str, intent: str) -> str:
    _cleanup_state()
    token = secrets.token_urlsafe(32)
    _pending_state[token] = (provider, time.monotonic() + STATE_TTL_SEC, source, mirror_id, user_id, intent)
    return token


def _pop_state(state: str | None) -> tuple[str, str, str, str, str] | None:
    if not state:
        return None
    _cleanup_state()
    entry = _pending_state.pop(state, None)
    if entry is None:
        return None
    provider, expiry, source, mirror_id, user_id, intent = entry
    if time.monotonic() > expiry:
        return None
    return provider, source, mirror_id, user_id, intent


def _public_base(request: Request) -> str:
    return get_oauth_public_base_url(str(request.base_url))


def _success_html(title: str, body: str) -> HTMLResponse:
    return HTMLResponse(
        f"""<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/><title>{title}</title>
<style>body{{font-family:system-ui,sans-serif;background:#111;color:#eee;max-width:30rem;margin:3rem auto;padding:1.5rem;text-align:center;}}</style></head>
<body><h1>{title}</h1><p>{body}</p></body></html>"""
    )


def _post_auth_redirect_url() -> str | None:
    return (
        os.getenv("OAUTH_SUCCESS_REDIRECT_URL")
        or os.getenv("SMART_MIRROR_WEB_URL")
        or "https://smart-mirror.tech"
    ).strip() or None


def _build_redirect_with_context(base_url: str, hardware_id: str, user_id: str) -> str:
    parsed = urlparse(base_url)
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    query["mirror_hardware_id"] = hardware_id
    query["mirror_user_id"] = user_id
    query["source"] = "mirror_qr_create"
    next_query = urlencode(query)
    return urlunparse((parsed.scheme, parsed.netloc, parsed.path, parsed.params, next_query, parsed.fragment))


async def _fetch_google_user_profile(access_token: str) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )
    if response.status_code != 200:
        logger.warning("Google userinfo fetch failed: %s %s", response.status_code, response.text)
        return {}
    try:
        return response.json()
    except Exception:
        return {}


@router.get("/google/start")
async def oauth_google_start(
    request: Request,
    hardware_id: str = Query(...),
    user_id: str = Query(...),
    source: str | None = None,
    intent: str = Query("pair_profile"),
    db: Session = Depends(get_db),
) -> RedirectResponse:
    client_id, _ = get_google_web_oauth_credentials()
    if not client_id:
        raise HTTPException(status_code=503, detail="Google web OAuth is not configured")

    mirror = user_service.get_mirror_by_hardware_id(db, hardware_id)
    if mirror is None:
        raise HTTPException(status_code=404, detail="Mirror is not registered")

    redirect_uri = f"{_public_base(request)}/api/oauth/google/callback"
    flow_source = "qr" if (source or "").strip().lower() == "qr" else "browser"
    state = _new_state("google", flow_source, mirror.id, user_id, intent)
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": GOOGLE_WEB_SCOPES,
        "state": state,
        "access_type": "offline",
        "prompt": "consent",
    }
    return RedirectResponse(f"{GOOGLE_AUTH_URL}?{urlencode(params)}", status_code=302)


@router.get("/google/callback")
async def oauth_google_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: Session = Depends(get_db),
) -> Any:
    if error:
        return _success_html("Sign-in cancelled", f"Provider returned: {error}")

    state_info = _pop_state(state)
    if not state_info or not code:
        raise HTTPException(status_code=400, detail="Invalid or expired state")
    provider, flow_source, mirror_id, user_id, intent = state_info
    if provider != "google":
        raise HTTPException(status_code=400, detail="Invalid or expired state")

    client_id, client_secret = get_google_web_oauth_credentials()
    redirect_uri = f"{_public_base(request)}/api/oauth/google/callback"
    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "client_id": client_id,
                "client_secret": client_secret,
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": redirect_uri,
            },
        )
    if response.status_code != 200:
        logger.warning("Google token exchange failed: %s %s", response.status_code, response.text)
        raise HTTPException(status_code=502, detail="Token exchange failed")

    try:
        payload = response.json()
        token = TokenResponse(
            access_token=payload["access_token"],
            refresh_token=payload.get("refresh_token") or "",
            expires_in=int(payload.get("expires_in", 3600)),
            scope=payload.get("scope"),
        )
        userinfo = await _fetch_google_user_profile(token.access_token)
        display_name = str(userinfo.get("name") or "").strip()
        email_local_part = str(userinfo.get("email") or "").split("@")[0].strip()
        resolved_display_name = display_name or email_local_part
        mirror = db.query(Mirror).filter(Mirror.id == mirror_id).first()
        if mirror is None:
            raise HTTPException(status_code=404, detail="Mirror is not registered")
        existing_profile = (
            db.query(UserProfile)
            .filter_by(mirror_id=mirror.id, user_id=user_id)
            .first()
        )
        if intent == "create_account":
            user_service.enroll_profile(
                db,
                mirror,
                user_id=user_id,
                display_name=resolved_display_name or "Google User",
                activate=True,
            )
        elif existing_profile is None:
            raise HTTPException(status_code=404, detail="Profile is not enrolled on this mirror")
        elif resolved_display_name:
            user_service.enroll_profile(
                db,
                mirror,
                user_id=user_id,
                display_name=resolved_display_name,
                activate=False,
            )
        if intent == "create_account":
            logger.info("Created mirror profile from Google OAuth for user_id=%s", user_id)
        await auth_manager.store_tokens_from_web("google", mirror_id, user_id, token)
    except HTTPException:
        raise
    except Exception:
        logger.exception("Google callback failed while persisting tokens")
        raise HTTPException(status_code=500, detail="Google login completed, but backend failed while saving tokens.")

    redirect_url = _post_auth_redirect_url()
    if redirect_url and (flow_source != "qr" or intent == "create_account"):
        if intent == "create_account":
            mirror = db.query(Mirror).filter(Mirror.id == mirror_id).first()
            hardware_id = mirror.hardware_id if mirror is not None else ""
            if hardware_id:
                redirect_url = _build_redirect_with_context(redirect_url, hardware_id=hardware_id, user_id=user_id)
        return RedirectResponse(redirect_url, status_code=302)
    return _success_html(
        "Google connected",
        "Sign-in complete. You can close this tab and return to the mirror.",
    )
