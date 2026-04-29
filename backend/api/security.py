from __future__ import annotations

import hmac
import os

from fastapi import Header, HTTPException, Query, WebSocket

from backend import config


def _expected_token() -> str:
    # Prefer dedicated API token, fallback to existing sync token for compatibility.
    return (os.getenv("MIRROR_API_TOKEN") or config.MIRROR_SYNC_TOKEN or "").strip()


def _constant_time_match(provided: str, expected: str) -> bool:
    return bool(provided and expected) and hmac.compare_digest(provided, expected)


def _parse_bearer(value: str | None) -> str:
    if not value:
        return ""
    raw = value.strip()
    if not raw.lower().startswith("bearer "):
        return ""
    return raw[7:].strip()


def require_api_token(
    authorization: str | None = Header(default=None),
    token: str | None = Query(default=None),
) -> None:
    expected = _expected_token()
    if not expected:
        raise HTTPException(status_code=503, detail="MIRROR_API_TOKEN is not configured")
    provided = (token or "").strip() or _parse_bearer(authorization)
    if not _constant_time_match(provided, expected):
        raise HTTPException(status_code=401, detail="Unauthorized")


async def require_websocket_token(
    websocket: WebSocket,
    token: str | None = Query(default=None),
) -> bool:
    expected = _expected_token()
    if not expected:
        await websocket.close(code=1013, reason="MIRROR_API_TOKEN not configured")
        return False
    header_token = _parse_bearer(websocket.headers.get("authorization"))
    provided = (token or "").strip() or header_token
    if not _constant_time_match(provided, expected):
        await websocket.close(code=1008, reason="Unauthorized")
        return False
    return True
