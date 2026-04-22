from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from backend.database.models import HouseholdMembership, OAuthCredential
from backend.database.session import get_db
from backend.schemas.mirror import OAuthCredentialOut, OAuthCredentialUpsertRequest
from backend.services.auth_context import AuthContext, ensure_can_manage_user, require_auth_context
from backend.services.auth_manager import auth_manager
from backend.services.providers.base import TokenResponse

router = APIRouter(prefix="/oauth/providers", tags=["oauth-providers"])


@router.get("/", response_model=list[OAuthCredentialOut])
def list_oauth_providers(
    context: AuthContext = Depends(require_auth_context),
    db: Session = Depends(get_db),
) -> list[OAuthCredentialOut]:
    rows = (
        db.query(OAuthCredential)
        .filter(OAuthCredential.mirror_id == context.mirror.id, OAuthCredential.user_id == context.actor.uid)
        .order_by(OAuthCredential.id.asc())
        .all()
    )
    return rows


@router.post("/token", response_model=OAuthCredentialOut, status_code=201)
def store_oauth_provider_token(
    payload: OAuthCredentialUpsertRequest,
    context: AuthContext = Depends(require_auth_context),
) -> OAuthCredentialOut:
    if payload.provider != "google":
        raise HTTPException(status_code=404, detail="endpoint missing or unsupported")
    token = TokenResponse(
        access_token=payload.access_token or "",
        refresh_token=payload.refresh_token,
        expires_in=payload.expires_in or 3600,
        scope=payload.scopes,
    )
    return auth_manager.store_tokens(payload.provider, context.mirror.id, context.actor.uid, token)


@router.delete("/{provider}")
async def delete_oauth_provider(
    provider: str,
    owner_user_uid: str | None = Query(default=None),
    context: AuthContext = Depends(require_auth_context),
    db: Session = Depends(get_db),
) -> dict:
    if provider != "google":
        raise HTTPException(status_code=404, detail="endpoint missing or unsupported")
    target_uid = (owner_user_uid or "").strip() or context.actor.uid
    ensure_can_manage_user(context, target_uid)
    target_member = (
        db.query(HouseholdMembership)
        .filter(HouseholdMembership.mirror_id == context.mirror.id, HouseholdMembership.user_uid == target_uid)
        .first()
    )
    if target_member is None:
        raise HTTPException(status_code=403, detail="authenticated but not allowed")
    await auth_manager.logout(provider, context.mirror.id, target_uid, revoke=True)
    return {
        "status": "ok",
        "provider": provider,
        "owner_user_uid": target_uid,
        "at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }
