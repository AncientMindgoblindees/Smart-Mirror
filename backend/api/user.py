from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from backend.database.models import UserSettings
from backend.database.session import get_db
from backend.schemas.mirror import (
    MirrorRegistrationOut,
    MirrorSyncOut,
    MirrorRegisterRequest,
    ProfileActivateRequest,
    ProfileEnrollRequest,
    ProfileOut,
)
from backend.schemas.user import UserSettingsCreate, UserSettingsOut, UserSettingsUpdate
from backend.services import user_service, widget_service
from backend.services.auth_context import (
    AuthContext,
    OptionalAuthContext,
    ensure_can_manage_user,
    optional_auth_context_no_token,
    resolve_user_scope_context_require_token,
)
from backend.services.auth_manager import auth_manager


router = APIRouter(prefix="/user", tags=["user"])
mirror_router = APIRouter(prefix="/mirror", tags=["mirror"])
profile_router = APIRouter(prefix="/profile", tags=["profile"])


@router.get("/settings", response_model=UserSettingsOut, summary="Get display settings for the active profile")
def get_user_settings(
    context=Depends(resolve_user_scope_context_require_token),
    db: Session = Depends(get_db),
) -> UserSettingsOut:
    return user_service.get_or_create_user_settings(db, context.mirror.id, context.user_uid)


@router.put("/settings", response_model=UserSettingsOut, summary="Update display settings for the active profile")
def put_user_settings(
    updates: UserSettingsUpdate,
    context=Depends(resolve_user_scope_context_require_token),
    db: Session = Depends(get_db),
) -> UserSettingsOut:
    return user_service.update_user_settings(db, context.mirror.id, context.user_uid, updates)


@router.post("/settings", response_model=UserSettingsOut, summary="Create settings row for the active profile")
def post_user_settings(
    payload: UserSettingsCreate,
    context=Depends(resolve_user_scope_context_require_token),
    db: Session = Depends(get_db),
) -> UserSettingsOut:
    existing = (
        db.query(UserSettings)
        .filter(UserSettings.mirror_id == context.mirror.id, UserSettings.user_id == context.user_uid)
        .first()
    )
    if existing is None:
        existing = UserSettings(mirror_id=context.mirror.id, user_id=context.user_uid, **payload.model_dump())
        db.add(existing)
    else:
        existing.deleted_at = None
        for key, value in payload.model_dump().items():
            setattr(existing, key, value)
    db.commit()
    db.refresh(existing)
    return existing


@router.delete("/settings", summary="Delete/reset settings for the active profile")
def delete_user_settings(
    context=Depends(resolve_user_scope_context_require_token),
    db: Session = Depends(get_db),
) -> dict:
    existing = (
        db.query(UserSettings)
        .filter(UserSettings.mirror_id == context.mirror.id, UserSettings.user_id == context.user_uid)
        .first()
    )
    if existing is not None:
        existing.deleted_at = datetime.utcnow()
        existing.updated_at = datetime.utcnow()
        db.commit()
    return {"status": "ok"}


@mirror_router.post("/register", response_model=MirrorRegistrationOut, status_code=201)
def register_mirror(payload: MirrorRegisterRequest, db: Session = Depends(get_db)) -> MirrorRegistrationOut:
    mirror, hardware_token = user_service.register_mirror(
        db,
        payload.hardware_id,
        friendly_name=payload.friendly_name,
        hardware_token=payload.hardware_token,
    )
    return MirrorRegistrationOut.model_validate(
        {
            "id": mirror.id,
            "hardware_id": mirror.hardware_id,
            "friendly_name": mirror.friendly_name,
            "created_at": mirror.created_at,
            "updated_at": mirror.updated_at,
            "hardware_token": hardware_token,
        }
    )


@mirror_router.get("/sync", response_model=MirrorSyncOut)
def mirror_sync(request: Request, db: Session = Depends(get_db)) -> MirrorSyncOut:
    mirror, profile = user_service.resolve_active_profile_context(db, request, require_token=True)
    widgets = widget_service.get_all_widgets(db, mirror.id, profile.user_id)
    settings = user_service.get_or_create_user_settings(db, mirror.id, profile.user_id)
    return MirrorSyncOut(
        mirror=mirror,
        active_profile=profile,
        widget_config=widgets,
        user_settings=settings,
    )


@profile_router.get("/", response_model=list[ProfileOut])
def list_profiles(
    context: OptionalAuthContext = Depends(optional_auth_context_no_token),
    db: Session = Depends(get_db),
) -> list[ProfileOut]:
    return user_service.list_profiles_for_mirror(db, context.mirror.id)


@profile_router.post("/enroll", response_model=ProfileOut, status_code=201)
def enroll_profile(
    payload: ProfileEnrollRequest,
    context: OptionalAuthContext = Depends(optional_auth_context_no_token),
    db: Session = Depends(get_db),
) -> ProfileOut:
    if context.mirror.hardware_id != payload.hardware_id:
        raise HTTPException(status_code=403, detail="authenticated but not allowed")
    if context.actor is not None and context.membership is not None:
        auth_context = AuthContext(actor=context.actor, mirror=context.mirror, membership=context.membership)
        ensure_can_manage_user(auth_context, payload.user_id)
    return user_service.enroll_profile(
        db,
        context.mirror,
        payload.user_id,
        display_name=payload.display_name,
        widget_config=payload.widget_config,
        activate=payload.activate,
    )


@profile_router.post("/activate", response_model=ProfileOut)
def activate_profile(
    payload: ProfileActivateRequest,
    context: OptionalAuthContext = Depends(optional_auth_context_no_token),
    db: Session = Depends(get_db),
) -> ProfileOut:
    if context.mirror.hardware_id != payload.hardware_id:
        raise HTTPException(status_code=403, detail="authenticated but not allowed")
    if context.actor is not None and context.membership is not None:
        auth_context = AuthContext(actor=context.actor, mirror=context.mirror, membership=context.membership)
        ensure_can_manage_user(auth_context, payload.target_user_id)
    return user_service.activate_profile(db, context.mirror, payload.target_user_id)


@profile_router.delete("/{user_id}")
def delete_profile(
    user_id: str,
    background_tasks: BackgroundTasks,
    context: OptionalAuthContext = Depends(optional_auth_context_no_token),
    db: Session = Depends(get_db),
) -> dict:
    if context.actor is not None and context.membership is not None:
        auth_context = AuthContext(actor=context.actor, mirror=context.mirror, membership=context.membership)
        ensure_can_manage_user(auth_context, user_id)
    profile = user_service.delete_profile(db, context.mirror, user_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not enrolled on this mirror")
    background_tasks.add_task(auth_manager.cleanup_unenrolled_user, context.mirror.id, user_id)
    return {"status": "ok", "removed_user_id": user_id, "deleted_clothing_items": 0}
