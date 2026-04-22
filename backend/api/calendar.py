from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from backend.database.models import CalendarEvent
from backend.database.session import get_db
from backend.schemas.calendar import (
    CalendarEventOut,
    CalendarEventsResponse,
    CalendarManualCreate,
    CalendarManualUpdate,
    CalendarTasksResponse,
)
from backend.services.auth_context import UserScopeContext, resolve_user_scope_context
from backend.services.auth_manager import auth_manager

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


def _provider_item_to_out(index: int, provider: str, item: Any) -> CalendarEventOut:
    return CalendarEventOut(
        id=-index,
        type=item.event_type,
        title=item.title,
        start_time=item.start_time,
        end_time=item.end_time,
        all_day=item.all_day,
        source=provider,
        priority=item.priority,
        completed=item.completed,
        metadata=item.metadata,
    )


async def _fetch_google_events(mirror_id: str, user_id: str, days: int) -> List[CalendarEventOut]:
    token = await auth_manager.get_valid_token("google", mirror_id, user_id)
    if not token:
        return []
    provider = auth_manager.get_provider("google")
    if provider is None:
        return []
    items = await provider.fetch_events(token, days_ahead=days)
    return [_provider_item_to_out(index, "google", item) for index, item in enumerate(items, start=1)]


@router.get("/events", response_model=CalendarEventsResponse)
async def get_events(
    days: int = Query(7, ge=1, le=30),
    context: UserScopeContext = Depends(resolve_user_scope_context),
    db: Session = Depends(get_db),
) -> Any:
    manual_rows = (
        db.query(CalendarEvent)
        .filter(
            CalendarEvent.mirror_id == context.mirror.id,
            CalendarEvent.user_id == context.user_uid,
            CalendarEvent.event_type == "event",
            CalendarEvent.provider == "manual",
        )
        .order_by(CalendarEvent.start_time.asc())
        .all()
    )
    google_rows = await _fetch_google_events(context.mirror.id, context.user_uid, days)
    return CalendarEventsResponse(
        events=google_rows + [_row_to_out(row) for row in manual_rows],
        providers=["google", "manual"],
        last_sync=datetime.now(timezone.utc).isoformat(),
    )


@router.get("/tasks", response_model=CalendarTasksResponse)
async def get_tasks(
    context: UserScopeContext = Depends(resolve_user_scope_context),
    db: Session = Depends(get_db),
) -> Any:
    rows = (
        db.query(CalendarEvent)
        .filter(
            CalendarEvent.mirror_id == context.mirror.id,
            CalendarEvent.user_id == context.user_uid,
            CalendarEvent.event_type.in_(["task", "reminder"]),
            CalendarEvent.completed == False,  # noqa: E712
        )
        .order_by(CalendarEvent.start_time.asc().nullslast())
        .all()
    )
    return CalendarTasksResponse(
        tasks=[_row_to_out(row) for row in rows],
        providers=["manual"],
        last_sync=None,
    )


@router.post("/manual", response_model=CalendarEventOut, status_code=201)
async def create_manual(
    payload: CalendarManualCreate,
    context: UserScopeContext = Depends(resolve_user_scope_context),
    db: Session = Depends(get_db),
) -> CalendarEventOut:
    if payload.type not in ("event", "task", "reminder"):
        raise HTTPException(status_code=400, detail="Manual entries must be event, task, or reminder")
    row = CalendarEvent(
        mirror_id=context.mirror.id,
        user_id=context.user_uid,
        provider="manual",
        external_id=f"manual:{int(datetime.utcnow().timestamp() * 1000)}",
        event_type=payload.type,
        title=payload.title,
        start_time=_parse_iso_opt(payload.start_time),
        end_time=_parse_iso_opt(payload.end_time),
        all_day=payload.all_day,
        priority=payload.priority,
        completed=payload.completed,
        metadata_json=payload.metadata,
        synced_at=datetime.utcnow(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _row_to_out(row)


@router.get("/manual", response_model=CalendarTasksResponse)
async def list_manual(
    context: UserScopeContext = Depends(resolve_user_scope_context),
    db: Session = Depends(get_db),
) -> CalendarTasksResponse:
    rows = (
        db.query(CalendarEvent)
        .filter(
            CalendarEvent.mirror_id == context.mirror.id,
            CalendarEvent.user_id == context.user_uid,
            CalendarEvent.provider == "manual",
            CalendarEvent.event_type.in_(["task", "reminder"]),
        )
        .order_by(CalendarEvent.start_time.asc().nullslast(), CalendarEvent.id.asc())
        .all()
    )
    return CalendarTasksResponse(tasks=[_row_to_out(row) for row in rows], providers=["manual"], last_sync=None)


@router.patch("/manual/{event_id}", response_model=CalendarEventOut)
async def patch_manual(
    event_id: int,
    payload: CalendarManualUpdate,
    context: UserScopeContext = Depends(resolve_user_scope_context),
    db: Session = Depends(get_db),
) -> CalendarEventOut:
    row = (
        db.query(CalendarEvent)
        .filter(
            CalendarEvent.id == event_id,
            CalendarEvent.mirror_id == context.mirror.id,
            CalendarEvent.user_id == context.user_uid,
        )
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Manual entry not found")
    _require_manual_event(row)
    updates = payload.model_dump(exclude_unset=True)
    if "start_time" in updates:
        row.start_time = _parse_iso_opt(updates.pop("start_time"))
    if "end_time" in updates:
        row.end_time = _parse_iso_opt(updates.pop("end_time"))
    for key, value in updates.items():
        if key == "metadata":
            row.metadata_json = value
        else:
            setattr(row, key, value)
    row.synced_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return _row_to_out(row)


@router.delete("/manual/{event_id}")
async def delete_manual(
    event_id: int,
    context: UserScopeContext = Depends(resolve_user_scope_context),
    db: Session = Depends(get_db),
) -> Any:
    row = (
        db.query(CalendarEvent)
        .filter(
            CalendarEvent.id == event_id,
            CalendarEvent.mirror_id == context.mirror.id,
            CalendarEvent.user_id == context.user_uid,
        )
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Manual entry not found")
    _require_manual_event(row)
    db.delete(row)
    db.commit()
    return {"status": "ok", "deleted_id": event_id}


def _parse_iso_opt(value: Optional[str]) -> Optional[datetime]:
    if value is None:
        return None
    text = value.strip()
    if not text:
        return None
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        return datetime.fromisoformat(text).replace(tzinfo=None)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid datetime: {value}") from exc


def _require_manual_event(row: CalendarEvent) -> None:
    if row.provider != "manual":
        raise HTTPException(status_code=409, detail="Provider-synced rows are read-only")
