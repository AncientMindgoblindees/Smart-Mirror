from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.database.models import UserSettings
from backend.database.session import get_db
from backend.schemas.user import UserSettingsCreate, UserSettingsOut, UserSettingsUpdate
from backend.services import user_service


router = APIRouter(prefix="/user", tags=["user"])


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
def put_user_settings(
    updates: UserSettingsUpdate,
    db: Session = Depends(get_db),
) -> UserSettingsOut:
    return user_service.update_user_settings(db, updates)


@router.post(
    "/settings",
    response_model=UserSettingsOut,
    summary="Create user settings singleton if absent",
)
def post_user_settings(
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
    return existing


@router.delete("/settings", summary="Delete/reset user settings singleton")
def delete_user_settings(db: Session = Depends(get_db)) -> dict:
    existing = db.query(UserSettings).first()
    if existing is not None:
        db.delete(existing)
        db.commit()
    return {"status": "ok"}

