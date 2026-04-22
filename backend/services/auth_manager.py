from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from backend.database.models import CalendarEvent, OAuthCredential
from backend.database.session import SessionLocal
from backend.services.crypto import decrypt_token, encrypt_token
from backend.services.providers.base import CalendarProvider, TokenResponse
from backend.services.providers.google_provider import GoogleProvider

logger = logging.getLogger(__name__)


def _credential_key(provider_name: str, mirror_id: str, user_id: str) -> str:
    return f"{provider_name}:{mirror_id}:{user_id}"


class AuthManager:
    def __init__(self) -> None:
        self._providers: Dict[str, CalendarProvider] = {"google": GoogleProvider()}
        self._pending_web_logins: Dict[str, tuple[float, str]] = {}

    def get_provider(self, name: str) -> Optional[CalendarProvider]:
        return self._providers.get(name)

    @property
    def supported_providers(self) -> List[str]:
        return list(self._providers.keys())

    async def start_web_redirect_login(
        self,
        provider_name: str,
        verification_uri: str,
        mirror_id: str,
        user_id: str,
        *,
        intent: str = "pair_profile",
        ttl_sec: int = 600,
    ) -> Dict[str, Any]:
        if provider_name not in self._providers:
            raise ValueError(f"Unknown provider: {provider_name}")
        key = _credential_key(provider_name, mirror_id, user_id)
        self._pending_web_logins[key] = (time.monotonic() + ttl_sec, intent)
        return {
            "provider": provider_name,
            "verification_uri": verification_uri,
            "user_code": "",
            "device_code": f"web-{provider_name}",
            "expires_in": ttl_sec,
            "interval": 5,
            "message": "Open the link to sign in with Google",
            "target_user_id": user_id,
            "intent": intent,
        }

    def cancel_login(self, provider_name: str, mirror_id: str, user_id: str) -> None:
        self._pending_web_logins.pop(_credential_key(provider_name, mirror_id, user_id), None)

    def get_login_status(self, provider_name: str, mirror_id: str, user_id: str) -> Dict[str, Any]:
        key = _credential_key(provider_name, mirror_id, user_id)
        pending_entry = self._pending_web_logins.get(key)
        if pending_entry is not None:
            expiry, intent = pending_entry
            if time.monotonic() <= expiry:
                return {"provider": provider_name, "status": "pending", "message": None, "intent": intent}
            self._pending_web_logins.pop(key, None)

        db: Session = SessionLocal()
        try:
            row = self._credential_row(db, provider_name, mirror_id, user_id)
            if row:
                return {"provider": provider_name, "status": row.status}
            return {"provider": provider_name, "status": "disconnected"}
        finally:
            db.close()

    def get_connected_providers(
        self,
        mirror_id: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        db: Session = SessionLocal()
        try:
            result: List[Dict[str, Any]] = []
            for provider_name in self._providers:
                row: Optional[OAuthCredential] = None
                if mirror_id and user_id:
                    row = self._credential_row(db, provider_name, mirror_id, user_id)
                if row:
                    result.append(
                        {
                            "provider": provider_name,
                            "connected": row.status == "active",
                            "status": row.status,
                            "scopes": row.scopes,
                            "connected_at": row.created_at.isoformat() if row.created_at else None,
                        }
                    )
                else:
                    result.append(
                        {
                            "provider": provider_name,
                            "connected": False,
                            "status": "disconnected",
                        }
                    )
            return result
        finally:
            db.close()

    async def store_tokens_from_web(
        self,
        provider_name: str,
        mirror_id: str,
        user_id: str,
        token: TokenResponse,
    ) -> None:
        self.cancel_login(provider_name, mirror_id, user_id)
        self._store_tokens(provider_name, mirror_id, user_id, token)

    def store_tokens(
        self,
        provider_name: str,
        mirror_id: str,
        user_id: str,
        token: TokenResponse,
    ) -> OAuthCredential:
        return self._store_tokens(provider_name, mirror_id, user_id, token)

    def _store_tokens(
        self,
        provider_name: str,
        mirror_id: str,
        user_id: str,
        token: TokenResponse,
    ) -> OAuthCredential:
        db: Session = SessionLocal()
        try:
            row = self._credential_row(db, provider_name, mirror_id, user_id)
            expiry = datetime.now(timezone.utc) + timedelta(seconds=token.expires_in)
            if row is None:
                row = OAuthCredential(
                    mirror_id=mirror_id,
                    user_id=user_id,
                    provider=provider_name,
                    access_token_enc=encrypt_token(token.access_token) if token.access_token else None,
                    refresh_token_enc=encrypt_token(token.refresh_token),
                    token_expiry=expiry,
                    scopes=token.scope,
                    status="active",
                )
                db.add(row)
            else:
                row.access_token_enc = (
                    encrypt_token(token.access_token) if token.access_token else row.access_token_enc
                )
                row.refresh_token_enc = encrypt_token(token.refresh_token)
                row.token_expiry = expiry
                row.scopes = token.scope or row.scopes
                row.status = "active"
            db.commit()
            db.refresh(row)
            return row
        finally:
            db.close()

    async def get_valid_token(self, provider_name: str, mirror_id: str, user_id: str) -> Optional[str]:
        db: Session = SessionLocal()
        try:
            row = self._credential_row(db, provider_name, mirror_id, user_id)
            if row is None:
                return None

            now = datetime.now(timezone.utc)
            expiry = row.token_expiry.replace(tzinfo=timezone.utc) if row.token_expiry else now
            if row.access_token_enc and now < expiry - timedelta(minutes=2):
                return decrypt_token(row.access_token_enc)

            provider = self._providers.get(provider_name)
            if provider is None:
                return None

            try:
                refresh_token = decrypt_token(row.refresh_token_enc)
                refreshed = await provider.refresh_access_token(refresh_token)
                row.access_token_enc = encrypt_token(refreshed.access_token)
                if refreshed.refresh_token:
                    row.refresh_token_enc = encrypt_token(refreshed.refresh_token)
                row.token_expiry = now + timedelta(seconds=refreshed.expires_in)
                row.status = "active"
                if refreshed.scope:
                    row.scopes = refreshed.scope
                db.commit()
                return refreshed.access_token
            except Exception:
                logger.exception(
                    "Token refresh failed for provider=%s mirror=%s user=%s",
                    provider_name,
                    mirror_id,
                    user_id,
                )
                row.status = "needs_reauth"
                db.commit()
                return None
        finally:
            db.close()

    async def logout(
        self,
        provider_name: str,
        mirror_id: str,
        user_id: str,
        *,
        revoke: bool = False,
    ) -> None:
        self.cancel_login(provider_name, mirror_id, user_id)
        db: Session = SessionLocal()
        try:
            row = self._credential_row(db, provider_name, mirror_id, user_id)
            refresh_token: Optional[str] = None
            if row is not None:
                try:
                    refresh_token = decrypt_token(row.refresh_token_enc)
                except Exception:
                    logger.warning("Failed to decrypt refresh token during logout cleanup")
                db.delete(row)

            db.query(CalendarEvent).filter(
                CalendarEvent.mirror_id == mirror_id,
                CalendarEvent.user_id == user_id,
                CalendarEvent.provider == provider_name,
            ).delete(synchronize_session=False)
            db.commit()
        finally:
            db.close()

        if revoke and refresh_token:
            provider = self._providers.get(provider_name)
            if provider is not None:
                try:
                    await provider.revoke_refresh_token(refresh_token)
                except Exception:
                    logger.exception("Failed to revoke refresh token for %s", provider_name)

    async def cleanup_unenrolled_user(self, mirror_id: str, user_id: str) -> None:
        db: Session = SessionLocal()
        try:
            rows = (
                db.query(OAuthCredential)
                .filter(OAuthCredential.mirror_id == mirror_id, OAuthCredential.user_id == user_id)
                .all()
            )
        finally:
            db.close()

        for row in rows:
            await self.logout(row.provider, mirror_id, user_id, revoke=True)

    @staticmethod
    def _credential_row(
        db: Session,
        provider_name: str,
        mirror_id: str,
        user_id: str,
    ) -> Optional[OAuthCredential]:
        return (
            db.query(OAuthCredential)
            .filter(
                OAuthCredential.provider == provider_name,
                OAuthCredential.mirror_id == mirror_id,
                OAuthCredential.user_id == user_id,
            )
            .first()
        )


auth_manager = AuthManager()
