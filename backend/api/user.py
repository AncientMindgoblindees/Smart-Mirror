from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.database.models import UserSettings
from backend.database.session import get_db
from backend.schemas.user import UserSettingsCreate, UserSettingsOut, UserSettingsUpdate
from backend.services import user_service
from backend.services.realtime import control_registry


router = APIRouter(prefix="/user", tags=["user"])


def _settings_payload(settings: UserSettings) -> dict:
    return {
        "id": settings.id,
        "theme": settings.theme,
        "primary_font_size": settings.primary_font_size,
        "accent_color": settings.accent_color,
        "created_at": settings.created_at.isoformat(),
        "updated_at": settings.updated_at.isoformat(),
    }


async def _broadcast_settings_updated(settings: UserSettings, source: str) -> None:
    await control_registry.broadcast(
        {
            "type": "USER_SETTINGS_UPDATED",
            "version": 2,
            "timestamp": datetime.utcnow().isoformat(),
            "payload": {
                "source": source,
                "settings": _settings_payload(settings),
            },
        }
    )


@router.get(
    "/settings",
    response_model=UserSettingsOut,
    summary="Get user display settings",
)
def get_user_settings(db: Session = Depends(get_db)) -> UserSettingsOut:
    return user_service.get_or_create_user_settings(db)


@router.put(
    "/settings",
    response_model=UserSettingsOut,
    summary="Update user display settings",
)
async def put_user_settings(
    updates: UserSettingsUpdate,
    db: Session = Depends(get_db),
) -> UserSettingsOut:
    settings = user_service.update_user_settings(db, updates)
    await _broadcast_settings_updated(settings, source="api")
    return settings


@router.post(
    "/settings",
    response_model=UserSettingsOut,
    summary="Create user settings singleton if absent",
)
async def post_user_settings(
    payload: UserSettingsCreate,
    db: Session = Depends(get_db),
) -> UserSettingsOut:
    existing = db.query(UserSettings).first()
    if existing is None:
        existing = UserSettings(**payload.model_dump())
        db.add(existing)
    else:
        for k, v in payload.model_dump().items():
            setattr(existing, k, v)
    db.commit()
    db.refresh(existing)
    await _broadcast_settings_updated(existing, source="api")
    return existing


@router.delete("/settings", summary="Delete/reset user settings singleton")
def delete_user_settings(db: Session = Depends(get_db)) -> dict:
    existing = db.query(UserSettings).first()
    if existing is not None:
        db.delete(existing)
        db.commit()
    return {"status": "ok"}

