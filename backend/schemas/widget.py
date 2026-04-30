from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field


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

    model_config = ConfigDict(from_attributes=True)


class WidgetConfigUpdate(WidgetConfigBase):
    id: Optional[int] = None


class WidgetConfigCreate(WidgetConfigBase):
    pass


class WidgetConfigPatch(BaseModel):
    widget_id: Optional[str] = None
    enabled: Optional[bool] = None
    position_row: Optional[int] = Field(None, ge=1)
    position_col: Optional[int] = Field(None, ge=1)
    size_rows: Optional[int] = Field(None, ge=1)
    size_cols: Optional[int] = Field(None, ge=1)
    config_json: Optional[Dict[str, Any]] = None


WidgetConfigList = List[WidgetConfigOut]

