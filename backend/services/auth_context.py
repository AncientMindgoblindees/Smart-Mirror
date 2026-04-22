from __future__ import annotations

import hashlib
import hmac
from dataclasses import dataclass
from datetime import datetime, timezone
import os

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from backend.database.models import HouseholdMembership, Mirror
from backend.database.session import get_db
from backend.services import user_service
from backend.services.firebase_auth import FirebaseAuthError, verify_firebase_id_token

HARDWARE_ID_HEADERS = ("x-mirror-hardware-id", "x-hardware-id")
HARDWARE_TOKEN_HEADERS = ("x-mirror-hardware-token", "x-hardware-token")


@dataclass
class FirebaseActor:
    uid: str
    email: str | None
    display_name: str | None
    photo_url: str | None


@dataclass
class AuthContext:
    actor: FirebaseActor
    mirror: Mirror
    membership: HouseholdMembership


@dataclass
class OptionalAuthContext:
    actor: FirebaseActor | None
    mirror: Mirror
    membership: HouseholdMembership | None


@dataclass
class UserScopeContext:
    mirror: Mirror
    user_uid: str
    actor: FirebaseActor | None
    membership: HouseholdMembership | None


def iso_z(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return f"{value.isoformat()}Z"
    utc_value = value.astimezone(timezone.utc)
    return utc_value.isoformat().replace("+00:00", "Z")


def _hash_secret(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _required_hardware_id(request: Request) -> str:
    for header_name in HARDWARE_ID_HEADERS:
        value = (request.headers.get(header_name) or "").strip()
        if value:
            return value
    query_value = (request.query_params.get("hardware_id") or "").strip()
    if query_value:
        return query_value
    raise HTTPException(status_code=400, detail="X-Mirror-Hardware-Id header is required")


def _require_mirror(db: Session, hardware_id: str) -> Mirror:
    mirror = db.query(Mirror).filter(Mirror.hardware_id == hardware_id).first()
    if mirror is None:
        raise HTTPException(status_code=404, detail="Mirror is not registered")
    return mirror


def _require_valid_hardware_token(request: Request, mirror: Mirror) -> None:
    supplied_token = None
    for header_name in HARDWARE_TOKEN_HEADERS:
        value = (request.headers.get(header_name) or "").strip()
        if value:
            supplied_token = value
            break
    if not supplied_token:
        supplied_token = (request.query_params.get("hardware_token") or "").strip() or None
    if not supplied_token:
        raise HTTPException(status_code=401, detail="Hardware token required")
    if not hmac.compare_digest(mirror.hardware_token_hash, _hash_secret(supplied_token)):
        raise HTTPException(status_code=401, detail="Invalid hardware token")


def _parse_bearer_token(request: Request, *, required: bool) -> str | None:
    auth_header = (request.headers.get("Authorization") or "").strip()
    if not auth_header:
        if required:
            raise HTTPException(status_code=401, detail="auth required / invalid Firebase token")
        return None
    if not auth_header.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="auth required / invalid Firebase token")
    token = auth_header[7:].strip()
    if not token:
        raise HTTPException(status_code=401, detail="auth required / invalid Firebase token")
    return token


def _actor_from_claims(claims: dict) -> FirebaseActor:
    uid = str(claims.get("uid") or "").strip()
    if not uid:
        raise HTTPException(status_code=401, detail="auth required / invalid Firebase token")
    email = str(claims.get("email") or "").strip() or None
    display_name = str(claims.get("name") or "").strip() or None
    photo_url = str(claims.get("picture") or "").strip() or None
    return FirebaseActor(uid=uid, email=email, display_name=display_name, photo_url=photo_url)


def _ensure_membership(db: Session, mirror: Mirror, actor: FirebaseActor) -> HouseholdMembership:
    membership = (
        db.query(HouseholdMembership)
        .filter(
            HouseholdMembership.mirror_id == mirror.id,
            HouseholdMembership.user_uid == actor.uid,
        )
        .first()
    )
    if membership is None:
        role = "member"
        if not mirror.claimed_by_user_uid:
            mirror.claimed_by_user_uid = actor.uid
            mirror.claimed_at = datetime.utcnow()
            role = "admin"
        elif mirror.claimed_by_user_uid == actor.uid:
            role = "admin"
        membership = HouseholdMembership(
            mirror_id=mirror.id,
            user_uid=actor.uid,
            email=actor.email,
            display_name=actor.display_name,
            photo_url=actor.photo_url,
            role=role,
        )
        db.add(membership)
        db.commit()
        db.refresh(membership)
        db.refresh(mirror)
        return membership

    changed = False
    if actor.email and membership.email != actor.email:
        membership.email = actor.email
        changed = True
    if actor.display_name and membership.display_name != actor.display_name:
        membership.display_name = actor.display_name
        changed = True
    if actor.photo_url and membership.photo_url != actor.photo_url:
        membership.photo_url = actor.photo_url
        changed = True
    if not mirror.claimed_by_user_uid:
        mirror.claimed_by_user_uid = actor.uid
        mirror.claimed_at = mirror.claimed_at or datetime.utcnow()
        changed = True
    if changed:
        db.commit()
        db.refresh(membership)
        db.refresh(mirror)
    return membership


def _build_auth_context(db: Session, request: Request, *, required: bool) -> OptionalAuthContext:
    hardware_id = _required_hardware_id(request)
    mirror = _require_mirror(db, hardware_id)
    token = _parse_bearer_token(request, required=required)
    if not token:
        _require_valid_hardware_token(request, mirror)
        return OptionalAuthContext(actor=None, mirror=mirror, membership=None)
    try:
        claims = verify_firebase_id_token(token)
    except FirebaseAuthError as exc:
        raise HTTPException(status_code=401, detail="auth required / invalid Firebase token") from exc
    actor = _actor_from_claims(claims)
    membership = _ensure_membership(db, mirror, actor)
    return OptionalAuthContext(actor=actor, mirror=mirror, membership=membership)


def _legacy_auth_enabled() -> bool:
    return os.getenv("ALLOW_LEGACY_MIRROR_AUTH", "1").strip().lower() not in {"0", "false", "no", "off"}


def require_auth_context(request: Request, db: Session = Depends(get_db)) -> AuthContext:
    optional_ctx = _build_auth_context(db, request, required=True)
    if optional_ctx.actor is None or optional_ctx.membership is None:
        raise HTTPException(status_code=401, detail="auth required / invalid Firebase token")
    return AuthContext(actor=optional_ctx.actor, mirror=optional_ctx.mirror, membership=optional_ctx.membership)


def optional_auth_context(request: Request, db: Session = Depends(get_db)) -> OptionalAuthContext:
    return _build_auth_context(db, request, required=False)


def optional_auth_context_no_token(request: Request, db: Session = Depends(get_db)) -> OptionalAuthContext:
    hardware_id = _required_hardware_id(request)
    mirror = _require_mirror(db, hardware_id)
    token = _parse_bearer_token(request, required=False)
    if not token:
        return OptionalAuthContext(actor=None, mirror=mirror, membership=None)
    try:
        claims = verify_firebase_id_token(token)
    except FirebaseAuthError as exc:
        raise HTTPException(status_code=401, detail="auth required / invalid Firebase token") from exc
    actor = _actor_from_claims(claims)
    membership = _ensure_membership(db, mirror, actor)
    return OptionalAuthContext(actor=actor, mirror=mirror, membership=membership)


def ensure_can_manage_user(context: AuthContext, target_user_uid: str) -> None:
    if target_user_uid == context.actor.uid:
        return
    if context.membership.role == "admin":
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="authenticated but not allowed",
    )


def _resolve_user_scope(
    db: Session,
    request: Request,
    *,
    require_legacy_hardware_token: bool,
) -> UserScopeContext:
    token = _parse_bearer_token(request, required=False)
    if token:
        try:
            claims = verify_firebase_id_token(token)
        except FirebaseAuthError as exc:
            raise HTTPException(status_code=401, detail="auth required / invalid Firebase token") from exc
        actor = _actor_from_claims(claims)
        hardware_id = _required_hardware_id(request)
        mirror = _require_mirror(db, hardware_id)
        membership = _ensure_membership(db, mirror, actor)
        return UserScopeContext(
            mirror=mirror,
            user_uid=actor.uid,
            actor=actor,
            membership=membership,
        )

    if not _legacy_auth_enabled():
        raise HTTPException(status_code=401, detail="auth required / invalid Firebase token")

    mirror, profile = user_service.resolve_active_profile_context(
        db,
        request,
        require_token=require_legacy_hardware_token,
    )
    return UserScopeContext(
        mirror=mirror,
        user_uid=profile.user_id,
        actor=None,
        membership=None,
    )


def resolve_user_scope_context(request: Request, db: Session = Depends(get_db)) -> UserScopeContext:
    return _resolve_user_scope(db, request, require_legacy_hardware_token=False)


def resolve_user_scope_context_require_token(request: Request, db: Session = Depends(get_db)) -> UserScopeContext:
    return _resolve_user_scope(db, request, require_legacy_hardware_token=True)
