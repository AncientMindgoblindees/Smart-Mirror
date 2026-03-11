from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class WidgetConfigBase(BaseModel):
    widget_id: str = Field(..., description="Widget identifier, e.g. 'clock', 'weather', 'calendar'")
    enabled: bool = True

    position_row: int = Field(1, ge=1)
    position_col: int = Field(1, ge=1)
    size_rows: int = Field(1, ge=1)
    size_cols: int = Field(1, ge=1)

    config_json: Optional[Dict[str, Any]] = None


class WidgetConfigOut(WidgetConfigBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        orm_mode = True


class WidgetConfigUpdate(WidgetConfigBase):
    id: Optional[int] = None


WidgetConfigList = List[WidgetConfigOut]

