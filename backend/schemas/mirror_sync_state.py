"""Pydantic models for WebSocket SYNC_STATE (config UI → mirror)."""

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


class SyncWidgetItem(BaseModel):
    """One widget in SYNC_STATE.widgets (layout in percent of mirror canvas)."""

    model_config = ConfigDict(extra="ignore")

    id: Optional[str] = None
    widget_id: Optional[str] = None
    name: Any = None
    type: Any = None
    x: Optional[float] = None
    y: Optional[float] = None
    width: Optional[float] = None
    height: Optional[float] = None
    config: Dict[str, Any] = Field(default_factory=dict)

    @field_validator("x", "y", "width", "height", mode="before")
    @classmethod
    def coerce_finite(cls, v: Any) -> Any:
        if v is None:
            return None
        if isinstance(v, bool):
            raise TypeError("boolean is not a valid number")
        try:
            n = float(v)
        except (TypeError, ValueError) as exc:
            raise ValueError("must be a finite number") from exc
        if n != n:  # NaN
            raise ValueError("must be a finite number")
        return n

    @field_validator("width", "height")
    @classmethod
    def positive_layout_size(cls, v: Optional[float]) -> Optional[float]:
        if v is None:
            return None
        if v <= 0 or v > 10_000:
            raise ValueError("width and height must be in (0, 10000]")
        return v

    @field_validator("x", "y")
    @classmethod
    def layout_position_sane(cls, v: Optional[float]) -> Optional[float]:
        if v is None:
            return None
        if v < -1_000 or v > 10_000:
            raise ValueError("x and y out of allowed range")
        return v


class SyncStateInbound(BaseModel):
    """Inbound WebSocket JSON with type SYNC_STATE."""

    model_config = ConfigDict(extra="ignore")

    type: str
    widgets: List[SyncWidgetItem] = Field(default_factory=list)
    action: Optional[Any] = None
    meta: Optional[Dict[str, Any]] = None
    protocol_version: Optional[int] = None


def sync_widgets_as_dicts(sync: SyncStateInbound) -> List[Dict[str, Any]]:
    """Plain dicts for persistence (matches _upsert_remote_widgets expectations)."""
    out: List[Dict[str, Any]] = []
    for w in sync.widgets:
        d = w.model_dump(mode="python", exclude_none=True)
        out.append(d)
    return out
