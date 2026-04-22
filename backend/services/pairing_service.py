from __future__ import annotations

import logging
import os
import secrets
import string
from datetime import datetime, timedelta
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from fastapi import HTTPException
from sqlalchemy.orm import Session

from backend.database.models import AuthPairing, OAuthCredential
from backend.services.auth_context import FirebaseActor, iso_z
from backend.services.crypto import decrypt_token, encrypt_token
from backend.services.providers.base import TokenResponse

PAIRING_TTL_MINUTES = 10
PAIRING_CODE_ALPHABET = string.ascii_uppercase + string.digits
logger = logging.getLogger(__name__)


def _utcnow() -> datetime:
    return datetime.utcnow()


def _generate_pairing_id() -> str:
    return f"pair_{secrets.token_urlsafe(12).replace('-', '').replace('_', '')[:16]}"


def _generate_pairing_code() -> str:
    return "".join(secrets.choice(PAIRING_CODE_ALPHABET) for _ in range(8))


def _append_query(url: str, params: dict[str, str]) -> str:
    parsed = urlparse(url)
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    query.update(params)
    return urlunparse(
        (parsed.scheme, parsed.netloc, parsed.path, parsed.params, urlencode(query), parsed.fragment)
    )


def _default_redirect_url() -> str | None:
    value = (os.getenv("OAUTH_SUCCESS_REDIRECT_URL", "") or "").strip()
    return value or None


def _upsert_oauth_credential(
    db: Session,
    *,
    mirror_id: str,
    user_uid: str,
    provider: str,
    token: TokenResponse,
) -> OAuthCredential:
    row = (
        db.query(OAuthCredential)
        .filter(
            OAuthCredential.mirror_id == mirror_id,
            OAuthCredential.user_id == user_uid,
            OAuthCredential.provider == provider,
        )
        .first()
    )
    expiry = _utcnow() + timedelta(seconds=int(token.expires_in or 3600))
    if row is None:
        row = OAuthCredential(
            mirror_id=mirror_id,
            user_id=user_uid,
            provider=provider,
            access_token_enc=encrypt_token(token.access_token) if token.access_token else None,
            refresh_token_enc=encrypt_token(token.refresh_token or ""),
            token_expiry=expiry,
            scopes=token.scope,
            status="active",
        )
        db.add(row)
    else:
        if token.access_token:
            row.access_token_enc = encrypt_token(token.access_token)
        if token.refresh_token:
            row.refresh_token_enc = encrypt_token(token.refresh_token)
        row.token_expiry = expiry
        row.scopes = token.scope or row.scopes
        row.status = "active"
    return row


def create_pairing(
    db: Session,
    *,
    mirror_id: str,
    provider: str,
    intent: str,
    redirect_to: str | None,
    public_base_url: str,
    owner: FirebaseActor | None,
    target_user_uid: str | None = None,
    target_user_email: str | None = None,
) -> tuple[AuthPairing, str]:
    if provider != "google":
        raise HTTPException(status_code=404, detail="endpoint missing or unsupported")

    expires_at = _utcnow() + timedelta(minutes=PAIRING_TTL_MINUTES)
    redirect_target = (redirect_to or "").strip() or _default_redirect_url()
    deep_link_url = _append_query(redirect_target, {"pairing_code": _generate_pairing_code()}) if redirect_target else None

    for _ in range(8):
        pairing_id = _generate_pairing_id()
        pairing_code = _generate_pairing_code()
        conflict = (
            db.query(AuthPairing)
            .filter(
                (AuthPairing.pairing_id == pairing_id) | (AuthPairing.pairing_code == pairing_code)
            )
            .first()
        )
        if conflict is not None:
            continue

        if deep_link_url:
            deep_link_url = _append_query(redirect_target, {"pairing_code": pairing_code})
        verification_url = deep_link_url
        oauth_url = f"{public_base_url}/api/oauth/{provider}/start?pairing_id={pairing_id}"
        if redirect_target:
            oauth_url = f"{oauth_url}&{urlencode({'redirect_to': redirect_target})}"

        initial_paired_uid = (
            target_user_uid
            if (intent or "link_provider") != "create_account"
            else None
        ) or (owner.uid if owner and (intent or "link_provider") != "create_account" else None)
        initial_paired_email = (
            target_user_email
            if (intent or "link_provider") != "create_account"
            else None
        ) or (owner.email if owner and (intent or "link_provider") != "create_account" else None)

        row = AuthPairing(
            pairing_id=pairing_id,
            pairing_code=pairing_code,
            mirror_id=mirror_id,
            provider=provider,
            intent=intent or "link_provider",
            status="awaiting_oauth",
            expires_at=expires_at,
            redirect_to=redirect_target,
            deep_link_url=deep_link_url,
            verification_url=verification_url,
            owner_user_uid=owner.uid if owner else None,
            owner_email=owner.email if owner else None,
            paired_user_uid=initial_paired_uid,
            paired_user_email=initial_paired_email,
            custom_token_ready=False,
            requires_session_replacement=False,
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        return row, oauth_url

    raise HTTPException(status_code=500, detail="Unable to create pairing")


def get_pairing_by_id(db: Session, pairing_id: str) -> AuthPairing | None:
    return db.query(AuthPairing).filter(AuthPairing.pairing_id == pairing_id).first()


def get_pairing_by_code(db: Session, pairing_code: str) -> AuthPairing | None:
    return db.query(AuthPairing).filter(AuthPairing.pairing_code == pairing_code).first()


def mark_expired_if_needed(db: Session, row: AuthPairing) -> AuthPairing:
    if row.status in {"complete", "expired"}:
        return row
    if row.expires_at <= _utcnow():
        row.status = "expired"
        row.error_code = row.error_code or "PAIRING_EXPIRED"
        row.error_message = row.error_message or "Pairing has expired."
        db.commit()
        db.refresh(row)
    return row


def store_oauth_callback_result(
    db: Session,
    *,
    pairing: AuthPairing,
    token: TokenResponse,
    oauth_email: str | None,
    firebase_actor: FirebaseActor | None = None,
) -> AuthPairing:
    pairing = mark_expired_if_needed(db, pairing)
    if pairing.status == "expired":
        return pairing

    if pairing.intent == "create_account":
        if firebase_actor is not None:
            pairing.paired_user_uid = firebase_actor.uid
            pairing.paired_user_email = firebase_actor.email or oauth_email or pairing.paired_user_email
            if pairing.owner_user_uid is None:
                pairing.owner_user_uid = firebase_actor.uid
            if not pairing.owner_email:
                pairing.owner_email = firebase_actor.email or oauth_email
        elif oauth_email:
            pairing.paired_user_email = oauth_email

        pairing.oauth_access_token_enc = encrypt_token(token.access_token) if token.access_token else None
        pairing.oauth_refresh_token_enc = encrypt_token(token.refresh_token) if token.refresh_token else None
        pairing.oauth_token_expiry = _utcnow() + timedelta(seconds=int(token.expires_in or 3600))
        pairing.oauth_scopes = token.scope
        pairing.custom_token_ready = bool(pairing.paired_user_uid)
        pairing.status = "authorized"
        pairing.error_code = None
        pairing.error_message = None
        db.commit()
        db.refresh(pairing)
        logger.info(
            "pairing_authorized pairing_id=%s provider=%s intent=%s paired_uid=%s",
            pairing.pairing_id,
            pairing.provider,
            pairing.intent,
            pairing.paired_user_uid,
        )
        return pairing

    target_uid = pairing.paired_user_uid or pairing.owner_user_uid
    if target_uid:
        _upsert_oauth_credential(
            db,
            mirror_id=pairing.mirror_id,
            user_uid=target_uid,
            provider=pairing.provider,
            token=token,
        )
        pairing.paired_user_uid = target_uid
        pairing.paired_user_email = pairing.paired_user_email or pairing.owner_email or oauth_email
        pairing.custom_token_ready = True
        pairing.status = "authorized"
        pairing.error_code = None
        pairing.error_message = None
        db.commit()
        db.refresh(pairing)
        logger.info(
            "pairing_authorized pairing_id=%s provider=%s intent=%s paired_uid=%s",
            pairing.pairing_id,
            pairing.provider,
            pairing.intent,
            pairing.paired_user_uid,
        )
        return pairing

    pairing.oauth_access_token_enc = encrypt_token(token.access_token) if token.access_token else None
    pairing.oauth_refresh_token_enc = encrypt_token(token.refresh_token) if token.refresh_token else None
    pairing.oauth_token_expiry = _utcnow() + timedelta(seconds=int(token.expires_in or 3600))
    pairing.oauth_scopes = token.scope
    pairing.paired_user_email = oauth_email
    pairing.custom_token_ready = False
    pairing.status = "authorized"
    pairing.error_code = None
    pairing.error_message = None
    db.commit()
    db.refresh(pairing)
    logger.info(
        "pairing_authorized pairing_id=%s provider=%s intent=%s paired_uid=%s",
        pairing.pairing_id,
        pairing.provider,
        pairing.intent,
        pairing.paired_user_uid,
    )
    return pairing


def bind_pairing_to_actor(db: Session, pairing: AuthPairing, actor: FirebaseActor) -> AuthPairing:
    pairing = mark_expired_if_needed(db, pairing)
    if pairing.status == "expired":
        return pairing

    if pairing.intent == "create_account" and pairing.paired_user_uid:
        target_uid = pairing.paired_user_uid
        if not pairing.owner_user_uid:
            pairing.owner_user_uid = target_uid
    else:
        target_uid = pairing.paired_user_uid or pairing.owner_user_uid or actor.uid
        if not pairing.owner_user_uid:
            pairing.owner_user_uid = actor.uid

    if actor.email and not pairing.owner_email:
        pairing.owner_email = actor.email
    pairing.paired_user_uid = target_uid
    pairing.paired_user_email = pairing.paired_user_email or pairing.owner_email or actor.email

    if pairing.oauth_refresh_token_enc and target_uid:
        refresh_token = decrypt_token(pairing.oauth_refresh_token_enc)
        access_token = decrypt_token(pairing.oauth_access_token_enc) if pairing.oauth_access_token_enc else ""
        if pairing.oauth_token_expiry is not None:
            expires_in = max(1, int((pairing.oauth_token_expiry - _utcnow()).total_seconds()))
        else:
            expires_in = 3600
        token = TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=expires_in,
            scope=pairing.oauth_scopes,
        )
        _upsert_oauth_credential(
            db,
            mirror_id=pairing.mirror_id,
            user_uid=target_uid,
            provider=pairing.provider,
            token=token,
        )
        pairing.oauth_access_token_enc = None
        pairing.oauth_refresh_token_enc = None
        pairing.oauth_token_expiry = None
        pairing.oauth_scopes = None

    pairing.requires_session_replacement = pairing.paired_user_uid != actor.uid
    pairing.custom_token_ready = bool(pairing.paired_user_uid)
    pairing.status = "authorized"
    pairing.error_code = None
    pairing.error_message = None
    db.commit()
    db.refresh(pairing)
    logger.info(
        "pairing_bound pairing_id=%s provider=%s intent=%s paired_uid=%s actor_uid=%s",
        pairing.pairing_id,
        pairing.provider,
        pairing.intent,
        pairing.paired_user_uid,
        actor.uid,
    )
    return pairing


def bind_pairing_to_uid(
    db: Session,
    *,
    pairing: AuthPairing,
    target_uid: str,
    target_email: str | None,
) -> AuthPairing:
    pairing = mark_expired_if_needed(db, pairing)
    if pairing.status == "expired":
        return pairing

    if not target_uid:
        raise HTTPException(status_code=409, detail="Pairing is not ready")

    pairing.paired_user_uid = target_uid
    pairing.paired_user_email = target_email or pairing.paired_user_email
    if not pairing.owner_user_uid:
        pairing.owner_user_uid = target_uid
    if not pairing.owner_email:
        pairing.owner_email = pairing.paired_user_email

    if pairing.oauth_refresh_token_enc:
        refresh_token = decrypt_token(pairing.oauth_refresh_token_enc)
        access_token = decrypt_token(pairing.oauth_access_token_enc) if pairing.oauth_access_token_enc else ""
        if pairing.oauth_token_expiry is not None:
            expires_in = max(1, int((pairing.oauth_token_expiry - _utcnow()).total_seconds()))
        else:
            expires_in = 3600
        token = TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=expires_in,
            scope=pairing.oauth_scopes,
        )
        _upsert_oauth_credential(
            db,
            mirror_id=pairing.mirror_id,
            user_uid=target_uid,
            provider=pairing.provider,
            token=token,
        )
        pairing.oauth_access_token_enc = None
        pairing.oauth_refresh_token_enc = None
        pairing.oauth_token_expiry = None
        pairing.oauth_scopes = None

    pairing.custom_token_ready = True
    pairing.requires_session_replacement = False
    pairing.status = "authorized"
    pairing.error_code = None
    pairing.error_message = None
    db.commit()
    db.refresh(pairing)
    logger.info(
        "pairing_bound pairing_id=%s provider=%s intent=%s paired_uid=%s actor_uid=none",
        pairing.pairing_id,
        pairing.provider,
        pairing.intent,
        pairing.paired_user_uid,
    )
    return pairing


def start_payload(pairing: AuthPairing, oauth_url: str) -> dict[str, Any]:
    return {
        "pairing_id": pairing.pairing_id,
        "provider": pairing.provider,
        "status": pairing.status,
        "expires_at": iso_z(pairing.expires_at),
        "pairing_code": pairing.pairing_code,
        "deep_link_url": pairing.deep_link_url,
        "verification_url": pairing.verification_url,
        "oauth_url": oauth_url,
        "owner_user_uid": pairing.owner_user_uid,
        "owner_email": pairing.owner_email,
    }


def redeem_payload(pairing: AuthPairing, actor: FirebaseActor) -> dict[str, Any]:
    requires_session_replacement = bool(pairing.paired_user_uid and pairing.paired_user_uid != actor.uid)
    return {
        "pairing_id": pairing.pairing_id,
        "provider": pairing.provider,
        "status": pairing.status,
        "expires_at": iso_z(pairing.expires_at),
        "requires_session_replacement": requires_session_replacement,
        "current_user": {
            "uid": actor.uid,
            "email": actor.email,
        },
        "paired_user": {
            "uid": pairing.paired_user_uid,
            "email": pairing.paired_user_email,
        },
    }


def detail_payload(pairing: AuthPairing, actor: FirebaseActor) -> dict[str, Any]:
    requires_session_replacement = bool(pairing.paired_user_uid and pairing.paired_user_uid != actor.uid)
    return {
        "pairing_id": pairing.pairing_id,
        "provider": pairing.provider,
        "status": pairing.status,
        "expires_at": iso_z(pairing.expires_at),
        "pairing_code": pairing.pairing_code,
        "owner_user_uid": pairing.owner_user_uid,
        "owner_email": pairing.owner_email,
        "custom_token_ready": pairing.custom_token_ready,
        "requires_session_replacement": requires_session_replacement,
        "current_user": {
            "uid": actor.uid,
            "email": actor.email,
        },
        "paired_user": {
            "uid": pairing.paired_user_uid,
            "email": pairing.paired_user_email,
        },
        "error_code": pairing.error_code,
        "error_message": pairing.error_message,
    }
