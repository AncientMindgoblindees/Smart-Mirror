"""
Google Calendar provider using OAuth 2.0 Device Authorization Grant.

Endpoints:
  - Device code:  POST https://oauth2.googleapis.com/device/code
  - Token:        POST https://oauth2.googleapis.com/token
  - Calendar:     GET  https://www.googleapis.com/calendar/v3/calendars/primary/events
"""

from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import List

import httpx

from backend.services.providers.base import (
    CalendarProvider,
    DeviceCodeResponse,
    NormalizedEvent,
    TokenResponse,
)

logger = logging.getLogger(__name__)

GOOGLE_DEVICE_CODE_URL = "https://oauth2.googleapis.com/device/code"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_CALENDAR_EVENTS_URL = (
    "https://www.googleapis.com/calendar/v3/calendars/primary/events"
)

GOOGLE_WEB_SCOPES = (
    "https://www.googleapis.com/auth/calendar.readonly "
    "https://www.googleapis.com/auth/gmail.readonly"
)
GOOGLE_DEVICE_SCOPES = GOOGLE_WEB_SCOPES
GOOGLE_DEVICE_SCOPES_FALLBACK = "https://www.googleapis.com/auth/calendar.readonly"


def get_google_device_oauth_credentials() -> tuple[str, str]:
    """
    Credentials for Google Device Authorization Grant (QR / TV flow).

    Preferred:
      - GOOGLE_TV_CLIENT_ID / GOOGLE_TV_CLIENT_SECRET
    Backward-compatible fallback:
      - GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
    """
    client_id = os.getenv("GOOGLE_TV_CLIENT_ID", "").strip() or os.getenv("GOOGLE_CLIENT_ID", "").strip()
    client_secret = os.getenv("GOOGLE_TV_CLIENT_SECRET", "").strip() or os.getenv("GOOGLE_CLIENT_SECRET", "").strip()
    return client_id, client_secret


def get_google_web_oauth_credentials() -> tuple[str, str]:
    """
    Credentials for Google authorization-code flow (browser redirect flow).

    Preferred:
      - GOOGLE_WEB_CLIENT_ID / GOOGLE_WEB_CLIENT_SECRET
    Backward-compatible fallback:
      - GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
    """
    client_id = os.getenv("GOOGLE_WEB_CLIENT_ID", "").strip() or os.getenv("GOOGLE_CLIENT_ID", "").strip()
    client_secret = os.getenv("GOOGLE_WEB_CLIENT_SECRET", "").strip() or os.getenv("GOOGLE_CLIENT_SECRET", "").strip()
    return client_id, client_secret


class GoogleProvider(CalendarProvider):
    provider_name = "google"

    def __init__(self) -> None:
        self._client_id, self._client_secret = get_google_device_oauth_credentials()

    # ── Device Code Flow ────────────────────────────────────────────────

    async def request_device_code(self) -> DeviceCodeResponse:
        data = {"client_id": self._client_id, "scope": GOOGLE_DEVICE_SCOPES}
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.post(
                GOOGLE_DEVICE_CODE_URL,
                data=data,
            )
            # Some Google TV/device clients reject extra scopes (e.g. gmail.readonly).
            # Fall back to calendar-only so QR login remains reliable.
            if r.status_code >= 400:
                body = {}
                try:
                    body = r.json()
                except Exception:
                    body = {}
                error_code = str(body.get("error", ""))
                error_desc = str(body.get("error_description", ""))
                scope_related = (
                    error_code == "invalid_scope"
                    or "scope" in error_code.lower()
                    or "scope" in error_desc.lower()
                )
                if scope_related:
                    logger.warning(
                        "Google device code scope rejected (%s); falling back to calendar-only scope",
                        error_code or "unknown_error",
                    )
                    r = await client.post(
                        GOOGLE_DEVICE_CODE_URL,
                        data={"client_id": self._client_id, "scope": GOOGLE_DEVICE_SCOPES_FALLBACK},
                    )
            if r.status_code >= 400:
                details = ""
                try:
                    details = r.text
                except Exception:
                    details = ""
                raise RuntimeError(
                    f"Google device code request failed ({r.status_code}): {details or 'no response body'}"
                )
        data = r.json()
        return DeviceCodeResponse(
            verification_uri=data["verification_url"],
            user_code=data["user_code"],
            device_code=data["device_code"],
            expires_in=int(data.get("expires_in", 1800)),
            interval=int(data.get("interval", 5)),
            message=f"Visit {data['verification_url']} and enter code {data['user_code']}",
        )

    async def poll_for_token(
        self, device_code: str, interval: int
    ) -> TokenResponse:
        deadline = asyncio.get_event_loop().time() + 1800
        wait = max(interval, 5)
        async with httpx.AsyncClient(timeout=15.0) as client:
            while asyncio.get_event_loop().time() < deadline:
                await asyncio.sleep(wait)
                r = await client.post(
                    GOOGLE_TOKEN_URL,
                    data={
                        "client_id": self._client_id,
                        "client_secret": self._client_secret,
                        "device_code": device_code,
                        "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
                    },
                )
                body = r.json()
                if r.status_code == 200:
                    return TokenResponse(
                        access_token=body["access_token"],
                        refresh_token=body.get("refresh_token", ""),
                        expires_in=int(body.get("expires_in", 3600)),
                        scope=body.get("scope"),
                    )
                error = body.get("error", "")
                if error == "authorization_pending":
                    continue
                if error == "slow_down":
                    wait += 5
                    continue
                if error in ("expired_token", "access_denied"):
                    raise TimeoutError(f"Google device auth failed: {error}")
                raise RuntimeError(f"Google token error: {error} — {body}")
        raise TimeoutError("Google device code expired")

    async def refresh_access_token(self, refresh_token: str) -> TokenResponse:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.post(
                GOOGLE_TOKEN_URL,
                data={
                    "client_id": self._client_id,
                    "client_secret": self._client_secret,
                    "refresh_token": refresh_token,
                    "grant_type": "refresh_token",
                },
            )
        r.raise_for_status()
        body = r.json()
        return TokenResponse(
            access_token=body["access_token"],
            refresh_token=body.get("refresh_token", refresh_token),
            expires_in=int(body.get("expires_in", 3600)),
            scope=body.get("scope"),
        )

    # ── Data Fetching ───────────────────────────────────────────────────

    async def fetch_events(
        self, access_token: str, days_ahead: int = 7
    ) -> List[NormalizedEvent]:
        now = datetime.now(timezone.utc)
        time_min = now.isoformat()
        time_max = (now + timedelta(days=days_ahead)).isoformat()
        params = {
            "timeMin": time_min,
            "timeMax": time_max,
            "singleEvents": "true",
            "orderBy": "startTime",
            "maxResults": "50",
        }
        headers = {"Authorization": f"Bearer {access_token}"}
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get(
                GOOGLE_CALENDAR_EVENTS_URL, params=params, headers=headers
            )
        if r.status_code == 401:
            raise PermissionError("access_token_expired")
        r.raise_for_status()
        items = r.json().get("items", [])
        return [self._normalize_event(item) for item in items if item.get("summary")]

    async def fetch_tasks(self, access_token: str) -> List[NormalizedEvent]:
        # Google Calendar API doesn't include tasks; return empty.
        return []

    @staticmethod
    def _normalize_event(item: dict) -> NormalizedEvent:
        start = item.get("start", {})
        end = item.get("end", {})
        all_day = "date" in start and "dateTime" not in start
        start_time = start.get("dateTime") or start.get("date")
        end_time = end.get("dateTime") or end.get("date")
        return NormalizedEvent(
            external_id=item.get("id", ""),
            event_type="event",
            title=item.get("summary", ""),
            start_time=start_time,
            end_time=end_time,
            all_day=all_day,
            metadata={
                "location": item.get("location"),
                "description": item.get("description"),
                "html_link": item.get("htmlLink"),
            },
        )
