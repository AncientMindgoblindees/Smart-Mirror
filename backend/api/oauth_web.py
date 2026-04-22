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
from backend.database.models import Mirror
from backend.database.session import get_db
from backend.services.auth_context import FirebaseActor
from backend.services.pairing_service import (
    create_pairing,
    get_pairing_by_code,
    get_pairing_by_id,
    mark_expired_if_needed,
    store_oauth_callback_result,
)
from backend.services.providers.base import TokenResponse
from backend.services.providers.google_provider import GOOGLE_WEB_SCOPES, get_google_web_oauth_credentials

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/oauth", tags=["oauth"])

STATE_TTL_SEC = 600.0
_pending_state: dict[str, tuple[str, float, str]] = {}

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"


def _cleanup_state() -> None:
    now = time.monotonic()
    dead = [key for key, (_, expiry, _) in _pending_state.items() if expiry < now]
    for key in dead:
        _pending_state.pop(key, None)


def _new_state(provider: str, pairing_id: str) -> str:
    _cleanup_state()
    token = secrets.token_urlsafe(32)
    _pending_state[token] = (provider, time.monotonic() + STATE_TTL_SEC, pairing_id)
    return token


def _pop_state(state: str | None) -> tuple[str, str] | None:
    if not state:
        return None
    _cleanup_state()
    entry = _pending_state.pop(state, None)
    if entry is None:
        return None
    provider, expiry, pairing_id = entry
    if time.monotonic() > expiry:
        return None
    return provider, pairing_id


def _public_base(request: Request) -> str:
    return get_oauth_public_base_url(str(request.base_url)).rstrip("/")


def _append_query(url: str, params: dict[str, str]) -> str:
    parsed = urlparse(url)
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    query.update(params)
    return urlunparse(
        (parsed.scheme, parsed.netloc, parsed.path, parsed.params, urlencode(query), parsed.fragment)
    )


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
        or ""
    ).strip() or None


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


@router.get("/{provider}/start")
async def oauth_start(
    provider: str,
    request: Request,
    pairing_id: str | None = Query(default=None),
    pairing_id_camel: str | None = Query(default=None, alias="pairingId"),
    pairing_code: str | None = Query(default=None),
    hardware_id: str | None = Query(default=None),
    user_id: str | None = Query(default=None),
    intent: str = Query(default="link_provider"),
    redirect_to: str | None = Query(None),
    db: Session = Depends(get_db),
) -> RedirectResponse:
    if provider != "google":
        raise HTTPException(status_code=404, detail="endpoint missing or unsupported")

    client_id, _ = get_google_web_oauth_credentials()
    if not client_id:
        raise HTTPException(status_code=503, detail="Google web OAuth is not configured")

    resolved_pairing_id = (pairing_id or pairing_id_camel or "").strip() or None
    resolved_pairing_code = (pairing_code or "").strip().upper() or None
    if resolved_pairing_id:
        pairing = get_pairing_by_id(db, resolved_pairing_id)
    elif resolved_pairing_code:
        pairing = get_pairing_by_code(db, resolved_pairing_code)
    else:
        legacy_hardware_id = (hardware_id or "").strip()
        legacy_user_id = (user_id or "").strip()
        if not legacy_hardware_id or not legacy_user_id:
            raise HTTPException(
                status_code=400,
                detail="pairing_id, pairingId, pairing_code, or hardware_id+user_id is required",
            )
        mirror = db.query(Mirror).filter(Mirror.hardware_id == legacy_hardware_id).first()
        if mirror is None:
            raise HTTPException(status_code=404, detail="Mirror is not registered")
        legacy_owner = FirebaseActor(
            uid=legacy_user_id,
            email=None,
            display_name=None,
            photo_url=None,
        )
        pairing, _ = create_pairing(
            db,
            mirror_id=mirror.id,
            provider=provider,
            intent="create_account" if intent == "create_account" else "link_provider",
            redirect_to=redirect_to,
            public_base_url=_public_base(request),
            owner=legacy_owner,
        )

    if pairing is None:
        raise HTTPException(status_code=404, detail="endpoint missing or unsupported")
    pairing = mark_expired_if_needed(db, pairing)
    if pairing.status == "expired":
        raise HTTPException(status_code=409, detail="Pairing has expired")
    if pairing.provider != provider:
        raise HTTPException(status_code=400, detail="Pairing/provider mismatch")

    if redirect_to is not None:
        pairing.redirect_to = redirect_to
        if redirect_to:
            deep_link = _append_query(redirect_to, {"pairing_code": pairing.pairing_code})
            pairing.deep_link_url = deep_link
            pairing.verification_url = deep_link
        db.commit()
        db.refresh(pairing)

    redirect_uri = f"{_public_base(request)}/api/oauth/{provider}/callback"
    state = _new_state(provider, pairing.pairing_id)
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


@router.get("/{provider}/callback")
async def oauth_callback(
    provider: str,
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: Session = Depends(get_db),
) -> Any:
    if provider != "google":
        raise HTTPException(status_code=404, detail="endpoint missing or unsupported")

    if error:
        return _success_html("Sign-in cancelled", f"Provider returned: {error}")

    state_info = _pop_state(state)
    if not state_info or not code:
        raise HTTPException(status_code=400, detail="Invalid or expired state")
    state_provider, pairing_id = state_info
    if state_provider != provider:
        raise HTTPException(status_code=400, detail="Invalid or expired state")

    pairing = get_pairing_by_id(db, pairing_id)
    if pairing is None:
        raise HTTPException(status_code=404, detail="endpoint missing or unsupported")
    pairing = mark_expired_if_needed(db, pairing)
    if pairing.status == "expired":
        return _success_html("Pairing expired", "This pairing is no longer valid. Please start again.")

    client_id, client_secret = get_google_web_oauth_credentials()
    redirect_uri = f"{_public_base(request)}/api/oauth/{provider}/callback"
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
        pairing.status = "error"
        pairing.error_code = "TOKEN_EXCHANGE_FAILED"
        pairing.error_message = "Token exchange failed"
        db.commit()
        db.refresh(pairing)
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
        oauth_email = str(userinfo.get("email") or "").strip() or None
        pairing = store_oauth_callback_result(db, pairing=pairing, token=token, oauth_email=oauth_email)
    except Exception:
        logger.exception("Google callback failed while persisting pairing tokens")
        pairing.status = "error"
        pairing.error_code = "PAIRING_PERSIST_FAILED"
        pairing.error_message = "OAuth completed but backend failed while saving pairing state."
        db.commit()
        db.refresh(pairing)
        raise HTTPException(status_code=500, detail=pairing.error_message)

    redirect_url = pairing.redirect_to or _post_auth_redirect_url()
    if redirect_url:
        redirect_url = _append_query(
            redirect_url,
            {
                "pairing_id": pairing.pairing_id,
                "pairing_code": pairing.pairing_code,
            },
        )
        return RedirectResponse(redirect_url, status_code=302)
    return _success_html(
        "Google connected",
        "Sign-in complete. You can close this tab and return to the app.",
    )
