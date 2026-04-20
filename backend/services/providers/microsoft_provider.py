"""
Microsoft provider using OAuth 2.0 Device Authorization Grant.

Uses Microsoft Graph API for Outlook Calendar + To Do tasks.

Endpoints:
  - Device code:  POST https://login.microsoftonline.com/common/oauth2/v2.0/devicecode
  - Token:        POST https://login.microsoftonline.com/common/oauth2/v2.0/token
  - Calendar:     GET  https://graph.microsoft.com/v1.0/me/calendar/events
  - Tasks:        GET  https://graph.microsoft.com/v1.0/me/todo/lists  + /tasks
"""

from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List

import httpx

from backend.services.providers.base import (
    CalendarProvider,
    DeviceCodeResponse,
    NormalizedEvent,
    TokenResponse,
)

logger = logging.getLogger(__name__)

MS_DEVICE_CODE_URL = (
    "https://login.microsoftonline.com/common/oauth2/v2.0/devicecode"
)
MS_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token"
GRAPH_CALENDAR_URL = "https://graph.microsoft.com/v1.0/me/calendar/events"
GRAPH_TODO_LISTS_URL = "https://graph.microsoft.com/v1.0/me/todo/lists"

SCOPES = "Calendars.Read Tasks.Read Mail.Read offline_access"


class MicrosoftProvider(CalendarProvider):
    provider_name = "microsoft"

    def __init__(self) -> None:
        self._client_id = os.getenv("MICROSOFT_CLIENT_ID", "")
        self._client_secret = os.getenv("MICROSOFT_CLIENT_SECRET", "")

    # ── Device Code Flow ────────────────────────────────────────────────

    async def request_device_code(self) -> DeviceCodeResponse:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.post(
                MS_DEVICE_CODE_URL,
                data={"client_id": self._client_id, "scope": SCOPES},
            )
        r.raise_for_status()
        data = r.json()
        return DeviceCodeResponse(
            verification_uri=data["verification_uri"],
            user_code=data["user_code"],
            device_code=data["device_code"],
            expires_in=int(data.get("expires_in", 900)),
            interval=int(data.get("interval", 5)),
            message=data.get("message"),
        )

    async def poll_for_token(
        self, device_code: str, interval: int
    ) -> TokenResponse:
        deadline = asyncio.get_event_loop().time() + 900
        wait = max(interval, 5)
        async with httpx.AsyncClient(timeout=15.0) as client:
            while asyncio.get_event_loop().time() < deadline:
                await asyncio.sleep(wait)
                r = await client.post(
                    MS_TOKEN_URL,
                    data={
                        "client_id": self._client_id,
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
                if error in ("expired_token", "authorization_declined"):
                    raise TimeoutError(f"Microsoft device auth failed: {error}")
                raise RuntimeError(
                    f"Microsoft token error: {error} — {body.get('error_description', '')}"
                )
        raise TimeoutError("Microsoft device code expired")

    async def refresh_access_token(self, refresh_token: str) -> TokenResponse:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.post(
                MS_TOKEN_URL,
                data={
                    "client_id": self._client_id,
                    "refresh_token": refresh_token,
                    "grant_type": "refresh_token",
                    "scope": SCOPES,
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
        time_min = now.strftime("%Y-%m-%dT%H:%M:%SZ")
        time_max = (now + timedelta(days=days_ahead)).strftime(
            "%Y-%m-%dT%H:%M:%SZ"
        )
        headers = {"Authorization": f"Bearer {access_token}"}
        params = {
            "$filter": f"start/dateTime ge '{time_min}' and start/dateTime le '{time_max}'",
            "$orderby": "start/dateTime",
            "$top": "50",
        }
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get(
                GRAPH_CALENDAR_URL, params=params, headers=headers
            )
        if r.status_code == 401:
            raise PermissionError("access_token_expired")
        r.raise_for_status()
        items = r.json().get("value", [])
        return [self._normalize_event(item) for item in items if item.get("subject")]

    async def fetch_tasks(self, access_token: str) -> List[NormalizedEvent]:
        headers = {"Authorization": f"Bearer {access_token}"}
        results: List[NormalizedEvent] = []
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get(GRAPH_TODO_LISTS_URL, headers=headers)
            if r.status_code == 401:
                raise PermissionError("access_token_expired")
            r.raise_for_status()
            lists_data = r.json().get("value", [])
            for todo_list in lists_data:
                list_id = todo_list.get("id", "")
                tasks_url = f"{GRAPH_TODO_LISTS_URL}/{list_id}/tasks"
                tr = await client.get(
                    tasks_url,
                    headers=headers,
                    params={
                        "$filter": "status ne 'completed'",
                        "$top": "25",
                    },
                )
                if tr.status_code != 200:
                    continue
                tasks = tr.json().get("value", [])
                for task in tasks:
                    results.append(
                        self._normalize_task(task, todo_list.get("displayName", ""))
                    )
        return results

    @staticmethod
    def _normalize_event(item: Dict[str, Any]) -> NormalizedEvent:
        start = item.get("start", {})
        end = item.get("end", {})
        all_day = item.get("isAllDay", False)
        return NormalizedEvent(
            external_id=item.get("id", ""),
            event_type="event",
            title=item.get("subject", ""),
            start_time=start.get("dateTime"),
            end_time=end.get("dateTime"),
            all_day=all_day,
            metadata={
                "location": (item.get("location") or {}).get("displayName"),
                "body_preview": item.get("bodyPreview"),
            },
        )

    @staticmethod
    def _normalize_task(task: Dict[str, Any], list_name: str) -> NormalizedEvent:
        due = task.get("dueDateTime", {})
        importance = task.get("importance", "normal")
        priority_map = {"low": "low", "normal": "medium", "high": "high"}
        return NormalizedEvent(
            external_id=task.get("id", ""),
            event_type="task",
            title=task.get("title", ""),
            start_time=due.get("dateTime") if due else None,
            completed=task.get("status") == "completed",
            priority=priority_map.get(importance, "medium"),
            metadata={"list_name": list_name},
        )
