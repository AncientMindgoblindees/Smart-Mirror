"""
Calendar API router — unified events and tasks from all connected providers.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, List, Optional

from fastapi import APIRouter, Query

from backend.database.models import CalendarEvent, OAuthProvider
from backend.database.session import SessionLocal
from backend.schemas.calendar import (
    CalendarEventOut,
    CalendarEventsResponse,
    CalendarTasksResponse,
)
from backend.services.sync_service import sync_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/calendar", tags=["calendar"])


def _row_to_out(row: CalendarEvent) -> CalendarEventOut:
    return CalendarEventOut(
        id=row.id,
        type=row.event_type,
        title=row.title,
        start_time=row.start_time.isoformat() if row.start_time else None,
        end_time=row.end_time.isoformat() if row.end_time else None,
        all_day=row.all_day or False,
        source=row.provider,
        priority=row.priority or "medium",
        completed=row.completed or False,
        metadata=row.metadata_json or {},
    )


@router.get("/events", response_model=CalendarEventsResponse)
async def get_events(
    days: int = Query(7, ge=1, le=30),
    provider: Optional[str] = Query(None),
) -> Any:
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        cutoff = now + timedelta(days=days)
        q = db.query(CalendarEvent).filter(
            CalendarEvent.event_type == "event",
            CalendarEvent.start_time <= cutoff,
        )
        if provider:
            q = q.filter(CalendarEvent.provider == provider)
        q = q.order_by(CalendarEvent.start_time.asc())
        rows = q.limit(100).all()

        providers = _connected_provider_names(db)
        last_sync = _latest_sync(providers)
        return CalendarEventsResponse(
            events=[_row_to_out(r) for r in rows],
            providers=providers,
            last_sync=last_sync,
        )
    finally:
        db.close()


@router.get("/tasks", response_model=CalendarTasksResponse)
async def get_tasks(
    provider: Optional[str] = Query(None),
) -> Any:
    db = SessionLocal()
    try:
        q = db.query(CalendarEvent).filter(
            CalendarEvent.event_type.in_(["task", "reminder"]),
            CalendarEvent.completed == False,  # noqa: E712
        )
        if provider:
            q = q.filter(CalendarEvent.provider == provider)
        q = q.order_by(CalendarEvent.start_time.asc().nullslast())
        rows = q.limit(100).all()

        providers = _connected_provider_names(db)
        last_sync = _latest_sync(providers)
        return CalendarTasksResponse(
            tasks=[_row_to_out(r) for r in rows],
            providers=providers,
            last_sync=last_sync,
        )
    finally:
        db.close()


@router.post("/sync")
async def force_sync(provider: Optional[str] = Query(None)) -> Any:
    try:
        await sync_manager.force_sync(provider)
        return {"status": "ok"}
    except Exception as exc:
        logger.exception("Force sync failed")
        return {"status": "error", "message": str(exc)}


def _connected_provider_names(db: Any) -> List[str]:
    rows = db.query(OAuthProvider.provider).filter_by(status="active").all()
    return [r[0] for r in rows]


def _latest_sync(providers: List[str]) -> Optional[str]:
    syncs = [sync_manager.get_last_sync(p) for p in providers]
    valid = [s for s in syncs if s]
    return max(valid) if valid else None
