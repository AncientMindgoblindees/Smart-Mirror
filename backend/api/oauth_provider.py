from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.database.models import OAuthCredential
from backend.database.session import get_db
from backend.schemas.mirror import OAuthCredentialOut, OAuthCredentialUpsertRequest
from backend.services import user_service
from backend.services.auth_manager import auth_manager
from backend.services.providers.base import TokenResponse

router = APIRouter(prefix="/oauth/providers", tags=["oauth-providers"])


@router.get("/", response_model=list[OAuthCredentialOut])
def list_oauth_providers(hardware_id: str, user_id: str, db: Session = Depends(get_db)) -> list[OAuthCredentialOut]:
    mirror = user_service.get_mirror_by_hardware_id(db, hardware_id)
    if mirror is None:
        raise HTTPException(status_code=404, detail="Mirror is not registered")
    return (
        db.query(OAuthCredential)
        .filter(OAuthCredential.mirror_id == mirror.id, OAuthCredential.user_id == user_id)
        .order_by(OAuthCredential.id.asc())
        .all()
    )


@router.post("/token", response_model=OAuthCredentialOut, status_code=201)
def store_oauth_provider_token(payload: OAuthCredentialUpsertRequest, db: Session = Depends(get_db)) -> OAuthCredentialOut:
    if payload.provider != "google":
        raise HTTPException(status_code=400, detail="Only Google OAuth is supported")
    mirror = user_service.get_mirror_by_hardware_id(db, payload.hardware_id)
    if mirror is None:
        raise HTTPException(status_code=404, detail="Mirror is not registered")
    token = TokenResponse(
        access_token=payload.access_token or "",
        refresh_token=payload.refresh_token,
        expires_in=payload.expires_in or 3600,
        scope=payload.scopes,
    )
    return auth_manager.store_tokens(payload.provider, mirror.id, payload.user_id, token)


@router.delete("/{provider}")
async def delete_oauth_provider(provider: str, hardware_id: str, user_id: str, db: Session = Depends(get_db)) -> dict:
    if provider != "google":
        raise HTTPException(status_code=400, detail="Only Google OAuth is supported")
    mirror = user_service.get_mirror_by_hardware_id(db, hardware_id)
    if mirror is None:
        raise HTTPException(status_code=404, detail="Mirror is not registered")
    await auth_manager.logout(provider, mirror.id, user_id, revoke=True)
    return {"status": "ok", "provider": provider, "user_id": user_id, "at": datetime.now(timezone.utc).isoformat()}
