"""
Email API router — unread/high-priority inbox summaries for connected providers.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from email.utils import parseaddr
from typing import Any, Dict, List, Optional

import httpx
from fastapi import APIRouter, Query

from backend.schemas.email import EmailMessageOut, EmailMessagesResponse
from backend.services.auth_manager import auth_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/email", tags=["email"])

GOOGLE_MESSAGES_LIST_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages"
GOOGLE_MESSAGE_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/{message_id}"


def _parse_iso_sort_value(value: Optional[str]) -> datetime:
    if not value:
        return datetime.min.replace(tzinfo=timezone.utc)
    txt = value
    if txt.endswith("Z"):
        txt = txt[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(txt)
        if dt.tzinfo is None:
            return dt.replace(tzinfo=timezone.utc)
        return dt
    except ValueError:
        return datetime.min.replace(tzinfo=timezone.utc)


def _header_value(headers: List[Dict[str, str]], name: str) -> str:
    target = name.lower()
    for header in headers:
        if (header.get("name") or "").lower() == target:
            return header.get("value", "")
    return ""


async def _fetch_google_messages(access_token: str, limit: int) -> List[EmailMessageOut]:
    headers = {"Authorization": f"Bearer {access_token}"}
    # Unread OR important messages in inbox.
    params = {
        "q": "in:inbox (is:unread OR is:important)",
        "maxResults": str(min(limit, 50)),
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        list_resp = await client.get(GOOGLE_MESSAGES_LIST_URL, params=params, headers=headers)
        if list_resp.status_code in (401, 403):
            return []
        list_resp.raise_for_status()
        refs = list_resp.json().get("messages", [])
        results: List[EmailMessageOut] = []
        for ref in refs[:limit]:
            message_id = ref.get("id")
            if not message_id:
                continue
            msg_resp = await client.get(
                GOOGLE_MESSAGE_URL.format(message_id=message_id),
                params={"format": "metadata", "metadataHeaders": ["From", "Subject", "Date"]},
                headers=headers,
            )
            if msg_resp.status_code != 200:
                continue
            payload = msg_resp.json()
            label_ids = set(payload.get("labelIds", []))
            metadata_headers = (payload.get("payload") or {}).get("headers", [])
            sender_raw = _header_value(metadata_headers, "From")
            sender_name, sender_addr = parseaddr(sender_raw)
            sender = sender_name or sender_addr or "Unknown sender"
            subject = _header_value(metadata_headers, "Subject") or "(no subject)"
            internal_date = payload.get("internalDate")
            received_at: Optional[str] = None
            if internal_date and str(internal_date).isdigit():
                dt = datetime.fromtimestamp(int(internal_date) / 1000, tz=timezone.utc)
                received_at = dt.isoformat()
            results.append(
                EmailMessageOut(
                    source="google",
                    sender=sender,
                    subject=subject,
                    received_at=received_at,
                    unread="UNREAD" in label_ids,
                    high_priority="IMPORTANT" in label_ids,
                )
            )
        return results


@router.get("/messages", response_model=EmailMessagesResponse)
async def get_messages(
    limit: int = Query(20, ge=1, le=50),
    provider: Optional[str] = Query(None),
) -> Any:
    connected = auth_manager.get_connected_providers()
    active_names = [
        row["provider"]
        for row in connected
        if row.get("connected") and row.get("status") == "active"
    ]
    if provider:
        active_names = [name for name in active_names if name == provider]

    async def fetch_for_provider(name: str) -> List[EmailMessageOut]:
        token = await auth_manager.get_valid_token(name)
        if not token:
            return []
        try:
            if name == "google":
                return await _fetch_google_messages(token, limit)
        except Exception:
            logger.exception("Email fetch failed for provider=%s", name)
        return []

    grouped = await asyncio.gather(*(fetch_for_provider(name) for name in active_names))
    merged = [msg for provider_msgs in grouped for msg in provider_msgs]
    merged.sort(key=lambda item: _parse_iso_sort_value(item.received_at), reverse=True)
    return EmailMessagesResponse(messages=merged[:limit], providers=active_names)
