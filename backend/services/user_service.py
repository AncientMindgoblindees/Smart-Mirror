from __future__ import annotations

import hashlib
import hmac
import os
import secrets
from typing import Optional, Tuple

from fastapi import HTTPException, Request, status
from sqlalchemy.orm import Session

from backend.database.models import Mirror, UserProfile, UserSettings
from backend.schemas.user import UserSettingsUpdate

HARDWARE_ID_HEADERS = ("x-mirror-hardware-id", "x-hardware-id")
HARDWARE_TOKEN_HEADERS = ("x-mirror-hardware-token", "x-hardware-token")
USER_ID_HEADERS = ("x-mirror-user-id", "x-user-id")


def _hash_secret(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def issue_hardware_token() -> str:
    return secrets.token_urlsafe(32)


def register_mirror(
    db: Session,
    hardware_id: str,
    friendly_name: Optional[str] = None,
    hardware_token: Optional[str] = None,
) -> tuple[Mirror, str]:
    mirror = db.query(Mirror).filter(Mirror.hardware_id == hardware_id).first()
    issued_token = hardware_token or issue_hardware_token()
    if mirror is None:
        mirror = Mirror(
            hardware_id=hardware_id,
            friendly_name=friendly_name,
            hardware_token_hash=_hash_secret(issued_token),
        )
        db.add(mirror)
    else:
        mirror.friendly_name = friendly_name or mirror.friendly_name
        # Re-issuing the mirror registration token keeps the device-side
        # bootstrap flow idempotent even when the backend stores only a hash.
        mirror.hardware_token_hash = _hash_secret(issued_token)
    db.commit()
    db.refresh(mirror)
    return mirror, issued_token


def get_mirror_by_hardware_id(db: Session, hardware_id: str) -> Optional[Mirror]:
    return db.query(Mirror).filter(Mirror.hardware_id == hardware_id).first()


def list_profiles_for_mirror(db: Session, mirror_id: str) -> list[UserProfile]:
    return (
        db.query(UserProfile)
        .filter(UserProfile.mirror_id == mirror_id)
        .order_by(UserProfile.is_active.desc(), UserProfile.display_name.asc(), UserProfile.id.asc())
        .all()
    )


def get_active_profile(db: Session, mirror_id: str) -> Optional[UserProfile]:
    return (
        db.query(UserProfile)
        .filter(UserProfile.mirror_id == mirror_id, UserProfile.is_active == True)  # noqa: E712
        .first()
    )


def enroll_profile(
    db: Session,
    mirror: Mirror,
    user_id: str,
    display_name: Optional[str] = None,
    widget_config: Optional[dict] = None,
    activate: bool = True,
) -> UserProfile:
    profile = (
        db.query(UserProfile)
        .filter(UserProfile.mirror_id == mirror.id, UserProfile.user_id == user_id)
        .first()
    )
    if profile is None:
        profile = UserProfile(
            mirror_id=mirror.id,
            user_id=user_id,
            display_name=display_name,
            widget_config=widget_config,
            is_active=False,
        )
        db.add(profile)
        db.flush()
    else:
        profile.display_name = display_name or profile.display_name
        if widget_config is not None:
            profile.widget_config = widget_config

    if activate:
        _set_active_profile(db, mirror.id, user_id)
    db.commit()
    db.refresh(profile)
    return profile


def activate_profile(db: Session, mirror: Mirror, target_user_id: str) -> UserProfile:
    profile = (
        db.query(UserProfile)
        .filter(UserProfile.mirror_id == mirror.id, UserProfile.user_id == target_user_id)
        .first()
    )
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not enrolled on this mirror")
    _set_active_profile(db, mirror.id, target_user_id)
    db.commit()
    db.refresh(profile)
    return profile


def delete_profile(db: Session, mirror: Mirror, user_id: str) -> Optional[UserProfile]:
    profile = (
        db.query(UserProfile)
        .filter(UserProfile.mirror_id == mirror.id, UserProfile.user_id == user_id)
        .first()
    )
    if profile is None:
        return None
    was_active = bool(profile.is_active)
    db.delete(profile)
    db.flush()
    if was_active:
        replacement = (
            db.query(UserProfile)
            .filter(UserProfile.mirror_id == mirror.id)
            .order_by(UserProfile.created_at.asc(), UserProfile.id.asc())
            .first()
        )
        if replacement is not None:
            replacement.is_active = True
    db.commit()
    return profile


def _set_active_profile(db: Session, mirror_id: str, target_user_id: str) -> None:
    rows = db.query(UserProfile).filter(UserProfile.mirror_id == mirror_id).all()
    for row in rows:
        row.is_active = row.user_id == target_user_id


def get_or_create_user_settings(
    db: Session,
    mirror_id: Optional[str],
    user_id: Optional[str],
) -> UserSettings:
    settings = (
        db.query(UserSettings)
        .filter(UserSettings.mirror_id == mirror_id, UserSettings.user_id == user_id)
        .first()
    )
    if settings is None:
        settings = UserSettings(mirror_id=mirror_id, user_id=user_id)
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings


def update_user_settings(
    db: Session,
    mirror_id: Optional[str],
    user_id: Optional[str],
    updates: UserSettingsUpdate,
) -> UserSettings:
    settings = get_or_create_user_settings(db, mirror_id, user_id)
    for field, value in updates.model_dump(exclude_unset=True).items():
        setattr(settings, field, value)
    db.commit()
    db.refresh(settings)
    return settings


def update_profile_widget_snapshot(
    db: Session,
    mirror_id: str,
    user_id: str,
    widget_config: dict,
) -> None:
    profile = (
        db.query(UserProfile)
        .filter(UserProfile.mirror_id == mirror_id, UserProfile.user_id == user_id)
        .first()
    )
    if profile is None:
        return
    profile.widget_config = widget_config
    db.commit()


def resolve_mirror_from_request(
    db: Session,
    request: Request,
    *,
    require_token: bool = False,
) -> Mirror:
    hardware_id_header = next(
        (
            request.headers.get(header_name)
            for header_name in HARDWARE_ID_HEADERS
            if request.headers.get(header_name)
        ),
        None,
    )
    hardware_id = (
        hardware_id_header
        or request.query_params.get("hardware_id")
        or os.getenv("DEFAULT_MIRROR_HARDWARE_ID", "").strip()
    )
    mirror: Optional[Mirror] = None
    if hardware_id:
        mirror = get_mirror_by_hardware_id(db, hardware_id)
    if mirror is None:
        mirrors = db.query(Mirror).order_by(Mirror.created_at.asc()).all()
        if len(mirrors) == 1:
            mirror = mirrors[0]
    if mirror is None:
        raise HTTPException(status_code=404, detail="Mirror is not registered")

    supplied_token = next(
        (
            request.headers.get(header_name)
            for header_name in HARDWARE_TOKEN_HEADERS
            if request.headers.get(header_name)
        ),
        None,
    ) or request.query_params.get("hardware_token")
    if require_token:
        if not supplied_token:
            raise HTTPException(status_code=401, detail="Hardware token required")
        if not hmac.compare_digest(mirror.hardware_token_hash, _hash_secret(supplied_token)):
            raise HTTPException(status_code=401, detail="Invalid hardware token")
    elif supplied_token and not hmac.compare_digest(mirror.hardware_token_hash, _hash_secret(supplied_token)):
        raise HTTPException(status_code=401, detail="Invalid hardware token")
    return mirror


def resolve_active_profile_context(
    db: Session,
    request: Request,
    *,
    require_token: bool = False,
) -> Tuple[Mirror, UserProfile]:
    mirror = resolve_mirror_from_request(db, request, require_token=require_token)
    profile = get_active_profile(db, mirror.id)
    if profile is None:
        raise HTTPException(status_code=404, detail="No active profile for mirror")

    requested_user_id = next(
        (
            request.headers.get(header_name)
            for header_name in USER_ID_HEADERS
            if request.headers.get(header_name)
        ),
        None,
    ) or request.query_params.get("user_id")
    if requested_user_id and requested_user_id != profile.user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Requested user does not match active mirror session",
        )
    return mirror, profile
