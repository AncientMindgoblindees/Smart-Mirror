"""
Browser-based OAuth 2.0 authorization code flow (sign-in on phone / companion).

Redirect URIs must be registered in Google Cloud Console and Azure App Registration:
  {public_base}/api/oauth/google/callback
  {public_base}/api/oauth/microsoft/callback
"""

from __future__ import annotations

import logging
import os
import secrets
import time
from typing import Any
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse

from backend.services.auth_manager import auth_manager
from backend.services.providers.base import TokenResponse
from backend.services.providers.google_provider import SCOPES as GOOGLE_SCOPES
from backend.services.providers.google_provider import get_google_web_oauth_credentials
from backend.services.providers.microsoft_provider import SCOPES as MS_SCOPES

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/oauth", tags=["oauth"])

STATE_TTL_SEC = 600.0
_pending_state: dict[str, tuple[str, float]] = {}

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"

MS_AUTH_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize"
MS_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token"


def _cleanup_state() -> None:
    now = time.monotonic()
    dead = [k for k, (_, exp) in _pending_state.items() if exp < now]
    for k in dead:
        _pending_state.pop(k, None)


def _new_state(provider: str) -> str:
    _cleanup_state()
    tok = secrets.token_urlsafe(32)
    _pending_state[tok] = (provider, time.monotonic() + STATE_TTL_SEC)
    return tok


def _pop_state(state: str | None) -> str | None:
    if not state:
        return None
    _cleanup_state()
    entry = _pending_state.pop(state, None)
    if entry is None:
        return None
    provider, exp = entry
    if time.monotonic() > exp:
        return None
    return provider


def _public_base(request: Request) -> str:
    return str(request.base_url).rstrip("/")


def _success_html(title: str, body: str) -> HTMLResponse:
    return HTMLResponse(
        f"""<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/><title>{title}</title>
<style>body{{font-family:system-ui,sans-serif;background:#111;color:#eee;max-width:28rem;margin:3rem auto;padding:1.5rem;text-align:center;}}</style></head>
<body><h1>{title}</h1><p>{body}</p></body></html>"""
    )


def _post_auth_redirect_url() -> str | None:
    """
    Optional URL to redirect to after successful browser OAuth callback.
    Defaults to smart-mirror.tech for hosted companion flow.
    """
    return (
        os.getenv("OAUTH_SUCCESS_REDIRECT_URL")
        or os.getenv("SMART_MIRROR_WEB_URL")
        or "https://smart-mirror.tech"
    ).strip() or None


@router.get("/google/start")
async def oauth_google_start(request: Request) -> RedirectResponse:
    client_id, _ = get_google_web_oauth_credentials()
    if not client_id:
        raise HTTPException(
            status_code=503,
            detail="GOOGLE_WEB_CLIENT_ID (or GOOGLE_CLIENT_ID) not configured",
        )

    redirect_uri = f"{_public_base(request)}/api/oauth/google/callback"
    state = _new_state("google")
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": GOOGLE_SCOPES,
        "state": state,
        "access_type": "offline",
        "prompt": "consent",
    }
    url = f"{GOOGLE_AUTH_URL}?{urlencode(params)}"
    return RedirectResponse(url, status_code=302)


@router.get("/google/callback")
async def oauth_google_callback(request: Request, code: str | None = None, state: str | None = None, error: str | None = None) -> Any:
    if error:
        return _success_html("Sign-in cancelled", f"Provider returned: {error}")
    provider = _pop_state(state)
    if provider != "google" or not code:
        raise HTTPException(status_code=400, detail="Invalid or expired state")

    client_id, client_secret = get_google_web_oauth_credentials()
    redirect_uri = f"{_public_base(request)}/api/oauth/google/callback"

    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "client_id": client_id,
                "client_secret": client_secret,
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": redirect_uri,
            },
        )
    if r.status_code != 200:
        logger.warning("Google token exchange failed: %s %s", r.status_code, r.text)
        raise HTTPException(status_code=502, detail="Token exchange failed")

    try:
        body = r.json()
        refresh = body.get("refresh_token") or ""
        if not refresh:
            logger.warning("Google web login returned no refresh_token; user may need to revoke app and retry")
        token = TokenResponse(
            access_token=body["access_token"],
            refresh_token=refresh,
            expires_in=int(body.get("expires_in", 3600)),
            scope=body.get("scope"),
        )
        await auth_manager.store_tokens_from_web("google", token)
    except Exception:
        logger.exception("Google callback failed while persisting tokens or starting sync")
        raise HTTPException(
            status_code=500,
            detail="Google login completed, but backend failed while saving tokens. Check backend logs.",
        )
    redirect_url = _post_auth_redirect_url()
    if redirect_url:
        return RedirectResponse(redirect_url, status_code=302)
    return _success_html("Google connected", "You can return to the Mirror Config app.")


@router.get("/microsoft/start")
async def oauth_microsoft_start(request: Request) -> RedirectResponse:
    import os

    client_id = os.getenv("MICROSOFT_CLIENT_ID", "").strip()
    if not client_id:
        raise HTTPException(status_code=503, detail="MICROSOFT_CLIENT_ID not configured")

    redirect_uri = f"{_public_base(request)}/api/oauth/microsoft/callback"
    state = _new_state("microsoft")
    params = {
        "client_id": client_id,
        "response_type": "code",
        "redirect_uri": redirect_uri,
        "response_mode": "query",
        "scope": MS_SCOPES,
        "state": state,
    }
    url = f"{MS_AUTH_URL}?{urlencode(params)}"
    return RedirectResponse(url, status_code=302)


@router.get("/microsoft/callback")
async def oauth_microsoft_callback(
    request: Request, code: str | None = None, state: str | None = None, error: str | None = None
) -> Any:
    import os

    if error:
        return _success_html("Sign-in cancelled", f"Provider returned: {error}")
    provider = _pop_state(state)
    if provider != "microsoft" or not code:
        raise HTTPException(status_code=400, detail="Invalid or expired state")

    client_id = os.getenv("MICROSOFT_CLIENT_ID", "").strip()
    client_secret = os.getenv("MICROSOFT_CLIENT_SECRET", "").strip()
    redirect_uri = f"{_public_base(request)}/api/oauth/microsoft/callback"

    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.post(
            MS_TOKEN_URL,
            data={
                "client_id": client_id,
                "client_secret": client_secret,
                "code": code,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
                "scope": MS_SCOPES,
            },
        )
    if r.status_code != 200:
        logger.warning("Microsoft token exchange failed: %s %s", r.status_code, r.text)
        raise HTTPException(status_code=502, detail="Token exchange failed")

    body = r.json()
    token = TokenResponse(
        access_token=body["access_token"],
        refresh_token=body.get("refresh_token", ""),
        expires_in=int(body.get("expires_in", 3600)),
        scope=body.get("scope"),
    )
    await auth_manager.store_tokens_from_web("microsoft", token)
    redirect_url = _post_auth_redirect_url()
    if redirect_url:
        return RedirectResponse(redirect_url, status_code=302)
    return _success_html("Microsoft connected", "You can return to the Mirror Config app.")
