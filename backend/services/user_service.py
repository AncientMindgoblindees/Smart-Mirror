from sqlalchemy.orm import Session

from backend.database.models import UserSettings
from backend.schemas.user import UserSettingsUpdate


def get_or_create_user_settings(db: Session) -> UserSettings:
    settings = db.query(UserSettings).first()
    if settings is None:
        settings = UserSettings()
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings


def update_user_settings(db: Session, updates: UserSettingsUpdate) -> UserSettings:
    settings = get_or_create_user_settings(db)

    for field, value in updates.dict(exclude_unset=True).items():
        setattr(settings, field, value)

    db.commit()
    db.refresh(settings)
    return settings

