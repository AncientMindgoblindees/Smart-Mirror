from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.database.session import get_db
from backend.schemas.user import UserSettingsOut, UserSettingsUpdate
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

