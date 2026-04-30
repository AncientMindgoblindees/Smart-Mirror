from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class OAuthProviderOut(BaseModel):
    id: int
    provider: str
    access_token_enc: str
    refresh_token_enc: str
    token_expiry: Optional[datetime] = None
    scopes: Optional[str] = None
    status: str

    model_config = ConfigDict(from_attributes=True)


class OAuthProviderCreate(BaseModel):
    provider: str
    access_token_enc: str
    refresh_token_enc: str
    token_expiry: Optional[datetime] = None
    scopes: Optional[str] = None
    status: str = "active"


class OAuthProviderUpdate(BaseModel):
    access_token_enc: Optional[str] = None
    refresh_token_enc: Optional[str] = None
    token_expiry: Optional[datetime] = None
    scopes: Optional[str] = None
    status: Optional[str] = None
