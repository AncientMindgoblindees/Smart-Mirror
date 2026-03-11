from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class UserSettingsBase(BaseModel):
    theme: str = Field("dark", description="Theme name, e.g. 'dark' or 'light'")
    primary_font_size: int = Field(72, ge=10, le=200)
    accent_color: str = Field("#4a9eff", description="Hex color like '#4a9eff'")


class UserSettingsOut(UserSettingsBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UserSettingsUpdate(BaseModel):
    theme: Optional[str] = None
    primary_font_size: Optional[int] = Field(None, ge=10, le=200)
    accent_color: Optional[str] = None

