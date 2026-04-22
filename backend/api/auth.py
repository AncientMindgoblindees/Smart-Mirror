from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.config import get_oauth_public_base_url
from backend.database.models import AuthPairing, HouseholdMembership, OAuthCredential
from backend.database.session import get_db
from backend.services.auth_context import (
    AuthContext,
    FirebaseActor,
    OptionalAuthContext,
    ensure_can_manage_user,
    iso_z,
    optional_auth_context,
    optional_auth_context_no_token,
    require_auth_context,
)
from backend.services.auth_manager import auth_manager
from backend.services.firebase_auth import FirebaseAuthError, create_firebase_custom_token
from backend.services.pairing_service import (
    bind_pairing_to_actor,
    create_pairing,
    detail_payload,
    get_pairing_by_code,
    get_pairing_by_id,
    mark_expired_if_needed,
    redeem_payload,
    start_payload,
)

router = APIRouter(prefix="/auth", tags=["auth"])


class PairingCreateRequest(BaseModel):
    provider: str = Field(default="google")
    intent: str = Field(default="link_provider")
    redirect_to: str | None = None


class PairingRedeemRequest(BaseModel):
    pairing_code: str = Field(..., min_length=4, max_length=32)


class PairingFinalizeRequest(BaseModel):
    replace_current_session: bool = False


def _provider_status_string(row: OAuthCredential | None) -> str:
    if row is None:
        return "disconnected"
    if row.status == "active":
        return "connected"
    return row.status or "disconnected"


def _authorize_pairing_view(context: AuthContext, pairing: AuthPairing) -> None:
    if pairing.mirror_id != context.mirror.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="authenticated but not allowed")
    if context.membership.role == "admin":
        return
    owner_uid = pairing.owner_user_uid
    paired_uid = pairing.paired_user_uid
    if owner_uid and owner_uid == context.actor.uid:
        return
    if paired_uid and paired_uid == context.actor.uid:
        return
    if owner_uid is None and paired_uid is None:
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="authenticated but not allowed")


def _legacy_provider_payloads(mirror_id: str, target_user_uid: str) -> list[dict[str, Any]]:
    rows = auth_manager.get_connected_providers(mirror_id, target_user_uid)
    for row in rows:
        if row.get("status") == "active":
            row["status"] = "connected"
    return rows


@router.get("/providers")
def list_providers(
    request: Request,
    user_id: str | None = Query(default=None),
    context: OptionalAuthContext = Depends(optional_auth_context_no_token),
    db: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    if context.actor is None or context.membership is None:
        target_user_uid = (user_id or request.query_params.get("user_id") or "").strip()
        if not target_user_uid:
            raise HTTPException(status_code=400, detail="user_id is required")
        return _legacy_provider_payloads(context.mirror.id, target_user_uid)

    actor_context = AuthContext(actor=context.actor, mirror=context.mirror, membership=context.membership)
    membership_rows = (
        db.query(HouseholdMembership)
        .filter(HouseholdMembership.mirror_id == actor_context.mirror.id)
        .all()
    )
    membership_by_uid = {row.user_uid: row for row in membership_rows}

    query = db.query(OAuthCredential).filter(OAuthCredential.mirror_id == actor_context.mirror.id)
    if actor_context.membership.role != "admin":
        query = query.filter(OAuthCredential.user_id == actor_context.actor.uid)
    credential_rows = query.order_by(OAuthCredential.created_at.desc()).all()

    items: list[dict[str, Any]] = []
    for row in credential_rows:
        owner = membership_by_uid.get(row.user_id)
        owner_email = (owner.email if owner else None) or (actor_context.actor.email if row.user_id == actor_context.actor.uid else None)
        is_owner = row.user_id == actor_context.actor.uid
        can_manage = is_owner or actor_context.membership.role == "admin"
        items.append(
            {
                "provider": row.provider,
                "connected": row.status == "active",
                "status": _provider_status_string(row),
                "scopes": row.scopes,
                "connected_at": iso_z(row.created_at),
                "owner_user_uid": row.user_id,
                "owner_email": owner_email,
                "is_current_user_owner": is_owner,
                "can_manage": can_manage,
                "can_disconnect": can_manage,
            }
        )

    if not items:
        items.append(
            {
                "provider": "google",
                "connected": False,
                "status": "disconnected",
                "scopes": None,
                "connected_at": None,
                "owner_user_uid": actor_context.actor.uid,
                "owner_email": actor_context.actor.email,
                "is_current_user_owner": True,
                "can_manage": True,
                "can_disconnect": True,
            }
        )
    return items


@router.post("/login/{provider}")
def legacy_start_login(
    provider: str,
    request: Request,
    hardware_id: str = Query(...),
    user_id: str = Query(...),
    intent: str = Query("pair_profile"),
    context: OptionalAuthContext = Depends(optional_auth_context_no_token),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    if provider != "google":
        raise HTTPException(status_code=404, detail="endpoint missing or unsupported")
    if context.mirror.hardware_id != hardware_id:
        raise HTTPException(status_code=403, detail="authenticated but not allowed")

    owner_actor = context.actor or FirebaseActor(
        uid=user_id,
        email=None,
        display_name=None,
        photo_url=None,
    )
    base = get_oauth_public_base_url(str(request.base_url)).rstrip("/")
    pairing, oauth_url = create_pairing(
        db,
        mirror_id=context.mirror.id,
        provider=provider,
        intent="create_account" if intent == "create_account" else "link_provider",
        redirect_to=None,
        public_base_url=base,
        owner=owner_actor,
    )
    expires_in = max(1, int((pairing.expires_at - datetime.utcnow()).total_seconds()))
    return {
        "provider": provider,
        "verification_uri": oauth_url,
        "user_code": pairing.pairing_code,
        "device_code": f"web-{provider}",
        "expires_in": expires_in,
        "interval": 5,
        "message": "Scan the QR link and finish Google sign-in",
        "target_user_id": user_id,
        "intent": intent,
    }


@router.get("/login/{provider}/status")
def legacy_login_status(
    provider: str,
    hardware_id: str = Query(...),
    user_id: str = Query(...),
    context: OptionalAuthContext = Depends(optional_auth_context_no_token),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    if provider != "google":
        raise HTTPException(status_code=404, detail="endpoint missing or unsupported")
    if context.mirror.hardware_id != hardware_id:
        raise HTTPException(status_code=403, detail="authenticated but not allowed")

    credential = (
        db.query(OAuthCredential)
        .filter(
            OAuthCredential.mirror_id == context.mirror.id,
            OAuthCredential.user_id == user_id,
            OAuthCredential.provider == provider,
        )
        .first()
    )
    if credential and credential.status == "active":
        return {"provider": provider, "status": "active", "message": None, "intent": None}

    pairing = (
        db.query(AuthPairing)
        .filter(
            AuthPairing.mirror_id == context.mirror.id,
            AuthPairing.provider == provider,
            AuthPairing.owner_user_uid == user_id,
        )
        .order_by(AuthPairing.updated_at.desc())
        .first()
    )
    if pairing is None:
        return {"provider": provider, "status": "disconnected", "message": None, "intent": None}

    pairing = mark_expired_if_needed(db, pairing)
    if pairing.status in {"awaiting_oauth", "pending", "awaiting_app"}:
        status_value = "pending"
    elif pairing.status in {"authorized", "complete"}:
        status_value = "active"
    elif pairing.status == "expired":
        status_value = "expired"
    else:
        status_value = "error"
    return {
        "provider": provider,
        "status": status_value,
        "message": pairing.error_message,
        "intent": pairing.intent,
    }


@router.post("/login/{provider}/cancel")
def legacy_cancel_login(
    provider: str,
    hardware_id: str = Query(...),
    user_id: str = Query(...),
    context: OptionalAuthContext = Depends(optional_auth_context_no_token),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    if provider != "google":
        raise HTTPException(status_code=404, detail="endpoint missing or unsupported")
    if context.mirror.hardware_id != hardware_id:
        raise HTTPException(status_code=403, detail="authenticated but not allowed")

    pairing = (
        db.query(AuthPairing)
        .filter(
            AuthPairing.mirror_id == context.mirror.id,
            AuthPairing.provider == provider,
            AuthPairing.owner_user_uid == user_id,
            AuthPairing.status.in_(["pending", "awaiting_app", "awaiting_oauth", "authorized"]),
        )
        .order_by(AuthPairing.updated_at.desc())
        .first()
    )
    if pairing is not None:
        pairing.status = "expired"
        pairing.error_code = "CANCELLED"
        pairing.error_message = "Cancelled by user"
        db.commit()
    return {"status": "ok", "provider": provider}


@router.post("/pairings")
def create_pairing_session(
    payload: PairingCreateRequest,
    request: Request,
    context=Depends(optional_auth_context),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    base = get_oauth_public_base_url(str(request.base_url)).rstrip("/")
    row, oauth_url = create_pairing(
        db,
        mirror_id=context.mirror.id,
        provider=payload.provider,
        intent=payload.intent,
        redirect_to=payload.redirect_to,
        public_base_url=base,
        owner=context.actor,
    )
    return start_payload(row, oauth_url)


@router.post("/pairings/redeem")
def redeem_pairing(
    payload: PairingRedeemRequest,
    context: AuthContext = Depends(require_auth_context),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    pairing = get_pairing_by_code(db, payload.pairing_code.strip().upper())
    if pairing is None:
        raise HTTPException(status_code=404, detail="endpoint missing or unsupported")
    _authorize_pairing_view(context, pairing)
    pairing = mark_expired_if_needed(db, pairing)
    if pairing.status != "expired":
        pairing = bind_pairing_to_actor(db, pairing, context.actor)
    return redeem_payload(pairing, context.actor)


@router.get("/pairings/{pairing_id}")
def get_pairing_status(
    pairing_id: str,
    context: AuthContext = Depends(require_auth_context),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    pairing = get_pairing_by_id(db, pairing_id)
    if pairing is None:
        raise HTTPException(status_code=404, detail="endpoint missing or unsupported")
    _authorize_pairing_view(context, pairing)
    pairing = mark_expired_if_needed(db, pairing)
    return detail_payload(pairing, context.actor)


@router.post("/pairings/{pairing_id}/finalize")
def finalize_pairing(
    pairing_id: str,
    payload: PairingFinalizeRequest,
    context: AuthContext = Depends(require_auth_context),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    pairing = get_pairing_by_id(db, pairing_id)
    if pairing is None:
        raise HTTPException(status_code=404, detail="endpoint missing or unsupported")
    _authorize_pairing_view(context, pairing)
    pairing = mark_expired_if_needed(db, pairing)
    if pairing.status != "expired":
        pairing = bind_pairing_to_actor(db, pairing, context.actor)
        if payload.replace_current_session and pairing.paired_user_uid and pairing.paired_user_uid != context.actor.uid:
            pairing.status = "complete"
            db.commit()
            db.refresh(pairing)
    return detail_payload(pairing, context.actor)


@router.post("/pairings/{pairing_id}/exchange-token")
def exchange_pairing_token(
    pairing_id: str,
    payload: PairingFinalizeRequest,
    context: AuthContext = Depends(require_auth_context),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    pairing = get_pairing_by_id(db, pairing_id)
    if pairing is None:
        raise HTTPException(status_code=404, detail="endpoint missing or unsupported")
    _authorize_pairing_view(context, pairing)
    pairing = mark_expired_if_needed(db, pairing)
    if pairing.status == "expired":
        raise HTTPException(status_code=409, detail="Pairing has expired")

    pairing = bind_pairing_to_actor(db, pairing, context.actor)
    paired_uid = pairing.paired_user_uid
    if not paired_uid:
        raise HTTPException(status_code=409, detail="Pairing is not ready")
    needs_replacement = paired_uid != context.actor.uid
    if needs_replacement and not payload.replace_current_session:
        raise HTTPException(status_code=409, detail="Session replacement required")

    try:
        custom_token = create_firebase_custom_token(paired_uid)
    except FirebaseAuthError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    pairing.status = "complete"
    db.commit()
    db.refresh(pairing)
    return {
        "pairing_id": pairing.pairing_id,
        "custom_token": custom_token,
        "provider": pairing.provider,
        "user": {
            "uid": paired_uid,
            "email": pairing.paired_user_email,
        },
        "replaced_session": bool(needs_replacement and payload.replace_current_session),
    }


@router.delete("/logout/{provider}")
async def logout(
    provider: str,
    owner_user_uid: str | None = Query(default=None),
    hardware_id: str | None = Query(default=None),
    user_id: str | None = Query(default=None),
    context: OptionalAuthContext = Depends(optional_auth_context_no_token),
    db: Session = Depends(get_db),
) -> Any:
    if provider != "google":
        raise HTTPException(status_code=404, detail="endpoint missing or unsupported")

    if hardware_id and context.mirror.hardware_id != hardware_id:
        raise HTTPException(status_code=403, detail="authenticated but not allowed")

    if context.actor is None or context.membership is None:
        target_uid = (user_id or owner_user_uid or "").strip()
        if not target_uid:
            raise HTTPException(status_code=400, detail="user_id is required")
    else:
        auth_context = AuthContext(actor=context.actor, mirror=context.mirror, membership=context.membership)
        target_uid = (owner_user_uid or "").strip() or auth_context.actor.uid
        ensure_can_manage_user(auth_context, target_uid)
        target_member = (
            db.query(HouseholdMembership)
            .filter(
                HouseholdMembership.mirror_id == auth_context.mirror.id,
                HouseholdMembership.user_uid == target_uid,
            )
            .first()
        )
        if target_member is None:
            raise HTTPException(status_code=403, detail="authenticated but not allowed")

    await auth_manager.logout(provider, context.mirror.id, target_uid, revoke=True)
    return {
        "status": "ok",
        "provider": provider,
        "owner_user_uid": target_uid,
        "user_id": target_uid,
        "at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }
