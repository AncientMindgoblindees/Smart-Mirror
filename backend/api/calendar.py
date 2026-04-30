"""
Calendar API router — unified events and tasks from all connected providers.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, List, Optional

from fastapi import APIRouter, HTTPException, Query

from backend.database.models import CalendarEvent, OAuthProvider
from backend.database.session import SessionLocal
from backend.schemas.calendar import (
    CalendarManualCreate,
    CalendarManualUpdate,
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


def _parse_iso_opt(value: Optional[str]) -> Optional[datetime]:
    if value is None:
        return None
    txt = value.strip()
    if not txt:
        return None
    if txt.endswith("Z"):
        txt = txt[:-1] + "+00:00"
    try:
        return datetime.fromisoformat(txt).replace(tzinfo=None)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid datetime: {value}") from exc


def _require_manual_event(row: CalendarEvent) -> None:
    if row.provider != "manual":
        raise HTTPException(status_code=409, detail="Provider-synced rows are read-only")


@router.post("/manual", response_model=CalendarEventOut, status_code=201)
async def create_manual(payload: CalendarManualCreate) -> CalendarEventOut:
    if payload.type not in ("task", "reminder"):
        raise HTTPException(status_code=400, detail="Manual entries must be task or reminder")
    db = SessionLocal()
    try:
        row = CalendarEvent(
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
    finally:
        db.close()


@router.get("/manual", response_model=CalendarTasksResponse)
async def list_manual() -> CalendarTasksResponse:
    db = SessionLocal()
    try:
        rows = (
            db.query(CalendarEvent)
            .filter(CalendarEvent.provider == "manual", CalendarEvent.event_type.in_(["task", "reminder"]))
            .order_by(CalendarEvent.start_time.asc().nullslast(), CalendarEvent.id.asc())
            .all()
        )
        return CalendarTasksResponse(tasks=[_row_to_out(r) for r in rows], providers=["manual"], last_sync=None)
    finally:
        db.close()


@router.patch("/manual/{event_id}", response_model=CalendarEventOut)
async def patch_manual(event_id: int, payload: CalendarManualUpdate) -> CalendarEventOut:
    db = SessionLocal()
    try:
        row = db.query(CalendarEvent).filter(CalendarEvent.id == event_id).first()
        if row is None:
            raise HTTPException(status_code=404, detail="Manual entry not found")
        _require_manual_event(row)
        updates = payload.model_dump(exclude_unset=True)
        if "start_time" in updates:
            row.start_time = _parse_iso_opt(updates.pop("start_time"))
        if "end_time" in updates:
            row.end_time = _parse_iso_opt(updates.pop("end_time"))
        for k, v in updates.items():
            if k == "metadata":
                row.metadata_json = v
            else:
                setattr(row, k, v)
        row.synced_at = datetime.utcnow()
        db.commit()
        db.refresh(row)
        return _row_to_out(row)
    finally:
        db.close()


@router.delete("/manual/{event_id}")
async def delete_manual(event_id: int) -> Any:
    db = SessionLocal()
    try:
        row = db.query(CalendarEvent).filter(CalendarEvent.id == event_id).first()
        if row is None:
            raise HTTPException(status_code=404, detail="Manual entry not found")
        _require_manual_event(row)
        db.delete(row)
        db.commit()
        return {"status": "ok", "deleted_id": event_id}
    finally:
        db.close()
