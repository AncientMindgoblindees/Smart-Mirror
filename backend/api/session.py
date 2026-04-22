from __future__ import annotations

from fastapi import APIRouter, Depends

from backend.services.auth_context import AuthContext, require_auth_context

router = APIRouter(prefix="/session", tags=["session"])


@router.get("/me")
def get_session_me(context: AuthContext = Depends(require_auth_context)) -> dict:
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
    }
