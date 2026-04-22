from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.database.models import HouseholdMembership
from backend.database.session import get_db
from backend.services.auth_context import AuthContext, require_auth_context
from backend.services import user_service

router = APIRouter(prefix="/session", tags=["session"])


@router.get("/me")
def get_session_me(
    context: AuthContext = Depends(require_auth_context),
    db: Session = Depends(get_db),
) -> dict:
    active_profile = user_service.get_active_profile(db, context.mirror.id)
    active_membership = None
    if active_profile is not None:
        active_membership = (
            db.query(HouseholdMembership)
            .filter(
                HouseholdMembership.mirror_id == context.mirror.id,
                HouseholdMembership.user_uid == active_profile.user_id,
            )
            .first()
        )
    return {
        "user": {
            "uid": context.actor.uid,
            "email": context.actor.email,
            "display_name": context.actor.display_name,
            "photo_url": context.actor.photo_url,
        },
        "hardware_id": context.mirror.hardware_id,
        "hardware_claimed": bool(context.mirror.claimed_by_user_uid),
        "role": context.membership.role,
        "claimed_by_user_uid": context.mirror.claimed_by_user_uid,
        "active_profile": (
            {
                "user_uid": active_profile.user_id,
                "display_name": active_profile.display_name,
                "photo_url": active_membership.photo_url if active_membership else None,
                "email": active_membership.email if active_membership else None,
                "is_active": bool(active_profile.is_active),
            }
            if active_profile is not None
            else None
        ),
    }
