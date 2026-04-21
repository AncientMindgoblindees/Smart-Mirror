from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from backend.api.calendar import _fetch_google_events
from backend.api.email import fetch_google_messages
from backend.database.models import WidgetConfig
from backend.database.session import get_db
from backend.schemas.email import EmailMessagesResponse
from backend.schemas.calendar import CalendarEventsResponse
from backend.schemas.widget import WidgetConfigCreate, WidgetConfigOut, WidgetConfigPatch, WidgetConfigUpdate
from backend.services import user_service, widget_service
from backend.services.auth_manager import auth_manager

router = APIRouter(prefix="/widgets", tags=["widgets"])


@router.get("/", response_model=List[WidgetConfigOut], summary="Get widget layout for the active profile")
def get_widgets(request: Request, db: Session = Depends(get_db)) -> List[WidgetConfigOut]:
    mirror, profile = user_service.resolve_active_profile_context(db, request, require_token=False)
    return widget_service.get_all_widgets(db, mirror.id, profile.user_id)


@router.put("/", response_model=List[WidgetConfigOut], summary="Replace the active profile widget layout")
def put_widgets(payload: List[WidgetConfigUpdate], request: Request, db: Session = Depends(get_db)) -> List[WidgetConfigOut]:
    mirror, profile = user_service.resolve_active_profile_context(db, request, require_token=False)
    return widget_service.replace_widgets(db, mirror.id, profile.user_id, payload)


@router.get("/revision", summary="Get layout revision token for the active profile")
def get_widget_layout_revision(request: Request, db: Session = Depends(get_db)) -> dict:
    mirror, profile = user_service.resolve_active_profile_context(db, request, require_token=False)
    return {"revision": widget_service.get_layout_revision(db, mirror.id, profile.user_id)}


@router.post("/item", response_model=WidgetConfigOut, status_code=201, summary="Create one widget row")
def create_widget_item(payload: WidgetConfigCreate, request: Request, db: Session = Depends(get_db)) -> WidgetConfigOut:
    mirror, profile = user_service.resolve_active_profile_context(db, request, require_token=False)
    row = WidgetConfig(mirror_id=mirror.id, user_id=profile.user_id, **payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.get("/item/{item_id}", response_model=WidgetConfigOut, summary="Get one widget row")
def get_widget_item(item_id: int, request: Request, db: Session = Depends(get_db)) -> WidgetConfigOut:
    mirror, profile = user_service.resolve_active_profile_context(db, request, require_token=False)
    row = (
        db.query(WidgetConfig)
        .filter_by(id=item_id, mirror_id=mirror.id, user_id=profile.user_id)
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Widget row not found")
    return row


@router.patch("/item/{item_id}", response_model=WidgetConfigOut, summary="Patch one widget row")
def patch_widget_item(item_id: int, payload: WidgetConfigPatch, request: Request, db: Session = Depends(get_db)) -> WidgetConfigOut:
    mirror, profile = user_service.resolve_active_profile_context(db, request, require_token=False)
    row = (
        db.query(WidgetConfig)
        .filter_by(id=item_id, mirror_id=mirror.id, user_id=profile.user_id)
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Widget row not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/item/{item_id}", summary="Delete one widget row")
def delete_widget_item(item_id: int, request: Request, db: Session = Depends(get_db)) -> dict:
    mirror, profile = user_service.resolve_active_profile_context(db, request, require_token=False)
    row = (
        db.query(WidgetConfig)
        .filter_by(id=item_id, mirror_id=mirror.id, user_id=profile.user_id)
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Widget row not found")
    db.delete(row)
    db.commit()
    return {"status": "ok", "deleted_id": item_id}


@router.get("/gmail", response_model=EmailMessagesResponse, summary="Mirror-safe Gmail proxy for the active profile")
async def get_widget_gmail(
    request: Request,
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
) -> EmailMessagesResponse:
    mirror, profile = user_service.resolve_active_profile_context(db, request, require_token=True)
    token = await auth_manager.get_valid_token("google", mirror.id, profile.user_id)
    messages = await fetch_google_messages(token, limit) if token else []
    return EmailMessagesResponse(messages=messages[:limit], providers=["google"])


@router.get("/calendar", response_model=CalendarEventsResponse, summary="Mirror-safe Calendar proxy for the active profile")
async def get_widget_calendar(
    request: Request,
    days: int = Query(7, ge=1, le=30),
    db: Session = Depends(get_db),
) -> CalendarEventsResponse:
    mirror, profile = user_service.resolve_active_profile_context(db, request, require_token=True)
    events = await _fetch_google_events(mirror.id, profile.user_id, days)
    return CalendarEventsResponse(events=events, providers=["google"], last_sync=None)
