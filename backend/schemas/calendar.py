from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class CalendarEventOut(BaseModel):
    """Unified normalized event/task/reminder consumed by widgets."""
    id: int
    type: str  # "event" | "task" | "reminder"
    title: str
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    all_day: bool = False
    source: str  # "google"
    priority: str = "medium"  # "low" | "medium" | "high"
    completed: bool = False
    metadata: Dict[str, Any] = {}


class CalendarEventsResponse(BaseModel):
    events: List[CalendarEventOut]
    providers: List[str]
    last_sync: Optional[str] = None


class CalendarTasksResponse(BaseModel):
    tasks: List[CalendarEventOut]
    providers: List[str]
    last_sync: Optional[str] = None


class CalendarManualCreate(BaseModel):
    type: str  # "task" | "reminder"
    title: str
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    all_day: bool = False
    priority: str = "medium"
    completed: bool = False
    metadata: Dict[str, Any] = {}


class CalendarManualUpdate(BaseModel):
    title: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    all_day: Optional[bool] = None
    priority: Optional[str] = None
    completed: Optional[bool] = None
    metadata: Optional[Dict[str, Any]] = None
