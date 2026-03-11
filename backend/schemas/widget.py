from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


class WidgetConfigBase(BaseModel):
    widget_id: str = Field(..., description="Widget identifier, e.g. 'clock', 'weather', 'calendar'")
    enabled: bool = True

    position_row: int = Field(1, ge=1)
    position_col: int = Field(1, ge=1)
    size_rows: int = Field(1, ge=1)
    size_cols: int = Field(1, ge=1)

    zone: Optional[str] = None
    display_order: Optional[int] = None
    row_span: Optional[int] = Field(default=None, ge=1)
    col_span: Optional[int] = Field(default=None, ge=1)

    config_json: Optional[Dict[str, Any]] = None

    @model_validator(mode="after")
    def apply_layout_defaults(self) -> "WidgetConfigBase":
        if self.row_span is None:
            self.row_span = self.size_rows
        if self.col_span is None:
            self.col_span = self.size_cols
        return self


class WidgetConfigOut(WidgetConfigBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class WidgetConfigUpdate(WidgetConfigBase):
    id: Optional[int] = None


WidgetConfigList = List[WidgetConfigOut]

