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
    source: str  # "google" | "microsoft"
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
