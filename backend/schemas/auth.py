from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


class DeviceCodeOut(BaseModel):
    """Returned when a device-code login flow is initiated."""
    provider: str
    verification_uri: str
    user_code: str
    expires_in: int
    interval: int
    message: Optional[str] = None
    target_user_id: Optional[str] = None
    intent: Optional[str] = None


class AuthStatusOut(BaseModel):
    """Polling response for an in-progress device-code flow."""
    provider: str
    status: str  # "pending" | "complete" | "expired" | "error"
    message: Optional[str] = None
    intent: Optional[str] = None


class ProviderStatusOut(BaseModel):
    """Status of a single connected (or disconnected) provider."""
    provider: str
    connected: bool
    status: str  # "active" | "needs_reauth" | "disconnected"
    scopes: Optional[str] = None
    connected_at: Optional[str] = None
