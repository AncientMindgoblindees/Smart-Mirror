from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.database.models import OAuthProvider
from backend.database.session import get_db
from backend.schemas.oauth_provider import OAuthProviderCreate, OAuthProviderOut, OAuthProviderUpdate

router = APIRouter(prefix="/oauth/providers", tags=["oauth-providers"])


@router.get("/", response_model=list[OAuthProviderOut])
def list_oauth_providers(db: Session = Depends(get_db)) -> list[OAuthProviderOut]:
    return db.query(OAuthProvider).order_by(OAuthProvider.id.asc()).all()


@router.get("/{provider_id}", response_model=OAuthProviderOut)
def get_oauth_provider(provider_id: int, db: Session = Depends(get_db)) -> OAuthProviderOut:
    row = db.query(OAuthProvider).filter(OAuthProvider.id == provider_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="OAuth provider row not found")
    return row


@router.post("/", response_model=OAuthProviderOut, status_code=201)
def create_oauth_provider(payload: OAuthProviderCreate, db: Session = Depends(get_db)) -> OAuthProviderOut:
    row = OAuthProvider(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.patch("/{provider_id}", response_model=OAuthProviderOut)
def patch_oauth_provider(
    provider_id: int,
    payload: OAuthProviderUpdate,
    db: Session = Depends(get_db),
) -> OAuthProviderOut:
    row = db.query(OAuthProvider).filter(OAuthProvider.id == provider_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="OAuth provider row not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/{provider_id}")
def delete_oauth_provider(provider_id: int, db: Session = Depends(get_db)) -> dict:
    row = db.query(OAuthProvider).filter(OAuthProvider.id == provider_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="OAuth provider row not found")
    db.delete(row)
    db.commit()
    return {"status": "ok", "deleted_id": provider_id}
