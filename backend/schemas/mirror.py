from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field

from backend.schemas.user import UserSettingsOut
from backend.schemas.widget import WidgetConfigOut


class MirrorRegisterRequest(BaseModel):
    hardware_id: str = Field(..., min_length=3, max_length=128)
    friendly_name: Optional[str] = Field(default=None, max_length=128)
    hardware_token: Optional[str] = Field(default=None, min_length=12, max_length=256)


class MirrorOut(BaseModel):
    id: str
    hardware_id: str
    friendly_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class MirrorRegistrationOut(MirrorOut):
    hardware_token: str


class ProfileEnrollRequest(BaseModel):
    hardware_id: str = Field(..., min_length=3, max_length=128)
    user_id: str = Field(..., min_length=1, max_length=128)
    display_name: Optional[str] = Field(default=None, max_length=128)
    widget_config: Optional[Dict[str, Any]] = None
    activate: bool = True


class ProfileActivateRequest(BaseModel):
    hardware_id: str = Field(..., min_length=3, max_length=128)
    target_user_id: str = Field(..., min_length=1, max_length=128)


class ProfileOut(BaseModel):
    id: int
    mirror_id: str
    user_id: str
    display_name: Optional[str] = None
    widget_config: Optional[Dict[str, Any]] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class MirrorSyncOut(BaseModel):
    mirror: MirrorOut
    active_profile: Optional[ProfileOut] = None
    widget_config: List[WidgetConfigOut] = []
    user_settings: Optional[UserSettingsOut] = None


class OAuthCredentialUpsertRequest(BaseModel):
    hardware_id: str = Field(..., min_length=3, max_length=128)
    user_id: str = Field(..., min_length=1, max_length=128)
    provider: str = Field(default="google", pattern="^google$")
    refresh_token: str = Field(..., min_length=1)
    access_token: Optional[str] = None
    expires_in: Optional[int] = Field(default=None, ge=1)
    scopes: Optional[str] = Field(default=None, max_length=256)


class OAuthCredentialOut(BaseModel):
    id: int
    mirror_id: str
    user_id: str
    provider: str
    scopes: Optional[str] = None
    status: str
    token_expiry: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
