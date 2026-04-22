from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from backend.api.calendar import _fetch_google_events
from backend.api.email import fetch_google_messages
from backend.database.models import WidgetConfig
from backend.database.session import get_db
from backend.schemas.calendar import CalendarEventsResponse
from backend.schemas.email import EmailMessagesResponse
from backend.schemas.widget import WidgetConfigCreate, WidgetConfigOut, WidgetConfigPatch, WidgetConfigUpdate
from backend.services import widget_service
from backend.services.auth_context import AuthContext, require_auth_context
from backend.services.auth_manager import auth_manager

router = APIRouter(prefix="/widgets", tags=["widgets"])


@router.get("/", response_model=List[WidgetConfigOut], summary="Get widget layout for the active profile")
def get_widgets(
    context: AuthContext = Depends(require_auth_context),
    db: Session = Depends(get_db),
) -> List[WidgetConfigOut]:
    return widget_service.get_all_widgets(db, context.mirror.id, context.actor.uid)


@router.put("/", response_model=List[WidgetConfigOut], summary="Replace the active profile widget layout")
def put_widgets(
    payload: List[WidgetConfigUpdate],
    context: AuthContext = Depends(require_auth_context),
    db: Session = Depends(get_db),
) -> List[WidgetConfigOut]:
    return widget_service.replace_widgets(db, context.mirror.id, context.actor.uid, payload)


@router.get("/revision", summary="Get layout revision token for the active profile")
def get_widget_layout_revision(
    context: AuthContext = Depends(require_auth_context),
    db: Session = Depends(get_db),
) -> dict:
    return {"revision": widget_service.get_layout_revision(db, context.mirror.id, context.actor.uid)}


@router.post("/item", response_model=WidgetConfigOut, status_code=201, summary="Create one widget row")
def create_widget_item(
    payload: WidgetConfigCreate,
    context: AuthContext = Depends(require_auth_context),
    db: Session = Depends(get_db),
) -> WidgetConfigOut:
    row = WidgetConfig(mirror_id=context.mirror.id, user_id=context.actor.uid, **payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.get("/item/{item_id}", response_model=WidgetConfigOut, summary="Get one widget row")
def get_widget_item(
    item_id: int,
    context: AuthContext = Depends(require_auth_context),
    db: Session = Depends(get_db),
) -> WidgetConfigOut:
    row = (
        db.query(WidgetConfig)
        .filter_by(id=item_id, mirror_id=context.mirror.id, user_id=context.actor.uid)
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Widget row not found")
    return row


@router.patch("/item/{item_id}", response_model=WidgetConfigOut, summary="Patch one widget row")
def patch_widget_item(
    item_id: int,
    payload: WidgetConfigPatch,
    context: AuthContext = Depends(require_auth_context),
    db: Session = Depends(get_db),
) -> WidgetConfigOut:
    row = (
        db.query(WidgetConfig)
        .filter_by(id=item_id, mirror_id=context.mirror.id, user_id=context.actor.uid)
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
def delete_widget_item(
    item_id: int,
    context: AuthContext = Depends(require_auth_context),
    db: Session = Depends(get_db),
) -> dict:
    row = (
        db.query(WidgetConfig)
        .filter_by(id=item_id, mirror_id=context.mirror.id, user_id=context.actor.uid)
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Widget row not found")
    db.delete(row)
    db.commit()
    return {"status": "ok", "deleted_id": item_id}


@router.get("/gmail", response_model=EmailMessagesResponse, summary="Mirror-safe Gmail proxy for the active profile")
async def get_widget_gmail(
    limit: int = Query(10, ge=1, le=50),
    context: AuthContext = Depends(require_auth_context),
) -> EmailMessagesResponse:
    token = await auth_manager.get_valid_token("google", context.mirror.id, context.actor.uid)
    messages = await fetch_google_messages(token, limit) if token else []
    return EmailMessagesResponse(messages=messages[:limit], providers=["google"])


@router.get("/calendar", response_model=CalendarEventsResponse, summary="Mirror-safe Calendar proxy for the active profile")
async def get_widget_calendar(
    days: int = Query(7, ge=1, le=30),
    context: AuthContext = Depends(require_auth_context),
) -> CalendarEventsResponse:
    events = await _fetch_google_events(context.mirror.id, context.actor.uid, days)
    return CalendarEventsResponse(events=events, providers=["google"], last_sync=None)
