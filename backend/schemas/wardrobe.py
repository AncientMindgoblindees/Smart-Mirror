from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class WardrobeItemOut(BaseModel):
    id: int
    user_id: str
    name: str
    category: Optional[str] = None
    image_url: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class WardrobeItemCreate(BaseModel):
    user_id: str = Field("local-dev", min_length=1, max_length=64)
    name: str = Field(..., min_length=1, max_length=128)
    category: Optional[str] = Field(default=None, max_length=64)
    image_url: str = Field(..., min_length=1, max_length=512)


class WardrobeTryOnPreviewRequest(BaseModel):
    user_id: str = Field("local-dev", min_length=1, max_length=64)
    wardrobe_item_id: int = Field(..., ge=1)
    capture_id: Optional[str] = Field(default=None, max_length=128)


class WardrobeTryOnPreviewResponse(BaseModel):
    preview_url: Optional[str] = None
    message: str
