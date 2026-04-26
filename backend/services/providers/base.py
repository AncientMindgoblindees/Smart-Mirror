"""Abstract base for calendar/task providers (Google, future)."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class DeviceCodeResponse:
    verification_uri: str
    user_code: str
    device_code: str
    expires_in: int
    interval: int
    message: Optional[str] = None


@dataclass
class TokenResponse:
    access_token: str
    refresh_token: str
    expires_in: int
    scope: Optional[str] = None


@dataclass
class NormalizedEvent:
    """Provider-agnostic event/task consumed by sync_service and widgets."""
    external_id: str
    event_type: str  # "event" | "task" | "reminder"
    title: str
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    all_day: bool = False
    priority: str = "medium"
    completed: bool = False
    metadata: Dict[str, Any] = field(default_factory=dict)


class CalendarProvider(ABC):
    """
    Each provider must implement these methods.  All HTTP calls use httpx
    so the backend stays fully async and dependency-light.
    """

    provider_name: str

    @abstractmethod
    async def request_device_code(self) -> DeviceCodeResponse:
        """Start the device-code grant; return URI + code for QR display."""

    @abstractmethod
    async def poll_for_token(self, device_code: str, interval: int) -> TokenResponse:
        """
        Block (with sleeps) until the user authorizes or the code expires.
        Raises TimeoutError on expiry, RuntimeError on unrecoverable errors.
        """

    @abstractmethod
    async def refresh_access_token(self, refresh_token: str) -> TokenResponse:
        """Exchange a refresh token for a new access + refresh pair."""

    @abstractmethod
    async def fetch_events(
        self, access_token: str, days_ahead: int = 7
    ) -> List[NormalizedEvent]:
        """Return upcoming calendar events normalized to NormalizedEvent."""

    @abstractmethod
    async def fetch_tasks(
        self, access_token: str
    ) -> List[NormalizedEvent]:
        """Return tasks/reminders normalized to NormalizedEvent."""
