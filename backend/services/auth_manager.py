"""
Central AuthManager — coordinates OAuth login flows, token storage,
auto-refresh, and provider registration.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from backend.database.models import CalendarEvent, OAuthProvider
from backend.database.session import SessionLocal
from backend.services.crypto import decrypt_token, encrypt_token
from backend.services.providers.base import (
    CalendarProvider,
    DeviceCodeResponse,
    TokenResponse,
)
from backend.services.providers.google_provider import GoogleProvider
from backend.services.providers.microsoft_provider import MicrosoftProvider
from backend.services.realtime import control_registry

logger = logging.getLogger(__name__)


class AuthManager:
    def __init__(self) -> None:
        self._providers: Dict[str, CalendarProvider] = {}
        self._pending_polls: Dict[str, asyncio.Task[Any]] = {}
        self._pending_device_codes: Dict[str, DeviceCodeResponse] = {}

        self.register_provider(GoogleProvider())
        self.register_provider(MicrosoftProvider())

    def register_provider(self, provider: CalendarProvider) -> None:
        self._providers[provider.provider_name] = provider

    def get_provider(self, name: str) -> Optional[CalendarProvider]:
        return self._providers.get(name)

    @property
    def supported_providers(self) -> List[str]:
        return list(self._providers.keys())

    # ── Login Flow ──────────────────────────────────────────────────────

    async def start_login(self, provider_name: str) -> DeviceCodeResponse:
        provider = self._providers.get(provider_name)
        if provider is None:
            raise ValueError(f"Unknown provider: {provider_name}")

        if provider_name in self._pending_polls:
            self._pending_polls[provider_name].cancel()

        device_code_resp = await provider.request_device_code()
        self._pending_device_codes[provider_name] = device_code_resp

        await control_registry.broadcast({
            "type": "OAUTH_DEVICE_CODE",
            "payload": {
                "provider": provider_name,
                "verification_uri": device_code_resp.verification_uri,
                "user_code": device_code_resp.user_code,
                "expires_in": device_code_resp.expires_in,
                "interval": device_code_resp.interval,
                "message": device_code_resp.message,
            },
        })

        task = asyncio.create_task(
            self._poll_and_store(provider_name, device_code_resp)
        )
        self._pending_polls[provider_name] = task
        return device_code_resp

    async def _poll_and_store(
        self, provider_name: str, dc: DeviceCodeResponse
    ) -> None:
        """Background task: poll for token, store encrypted, broadcast."""
        provider = self._providers[provider_name]
        try:
            token_resp = await provider.poll_for_token(dc.device_code, dc.interval)
            self._store_tokens(provider_name, token_resp)
            self._pending_device_codes.pop(provider_name, None)

            await control_registry.broadcast({
                "type": "AUTH_STATE_CHANGED",
                "payload": {
                    "provider": provider_name,
                    "status": "connected",
                },
            })
            logger.info("OAuth complete for %s", provider_name)

            # Import here to avoid circular import at module level
            from backend.services.sync_service import sync_manager
            # Run one sync right away so widgets populate immediately after linking.
            await sync_manager.force_sync(provider_name)
            # Then keep background periodic sync running on the normal interval.
            await sync_manager.start_provider_sync(provider_name, run_immediately=False)

        except (TimeoutError, RuntimeError) as exc:
            logger.warning("OAuth flow failed for %s: %s", provider_name, exc)
            self._pending_device_codes.pop(provider_name, None)
            await control_registry.broadcast({
                "type": "AUTH_STATE_CHANGED",
                "payload": {
                    "provider": provider_name,
                    "status": "error",
                    "message": str(exc),
                },
            })
        except asyncio.CancelledError:
            self._pending_device_codes.pop(provider_name, None)
        finally:
            self._pending_polls.pop(provider_name, None)

    def _store_tokens(self, provider_name: str, token: TokenResponse) -> None:
        db: Session = SessionLocal()
        try:
            row = db.query(OAuthProvider).filter_by(provider=provider_name).first()
            expiry = datetime.now(timezone.utc) + timedelta(seconds=token.expires_in)
            if row is None:
                row = OAuthProvider(
                    provider=provider_name,
                    access_token_enc=encrypt_token(token.access_token),
                    refresh_token_enc=encrypt_token(token.refresh_token),
                    token_expiry=expiry,
                    scopes=token.scope,
                    status="active",
                )
                db.add(row)
            else:
                row.access_token_enc = encrypt_token(token.access_token)
                if token.refresh_token:
                    row.refresh_token_enc = encrypt_token(token.refresh_token)
                row.token_expiry = expiry
                row.scopes = token.scope or row.scopes
                row.status = "active"
            db.commit()
        finally:
            db.close()

    async def store_tokens_from_web(self, provider_name: str, token: TokenResponse) -> None:
        """Persist tokens from authorization-code (browser) flow and start sync."""
        self._store_tokens(provider_name, token)
        await control_registry.broadcast({
            "type": "AUTH_STATE_CHANGED",
            "payload": {"provider": provider_name, "status": "connected"},
        })
        from backend.services.sync_service import sync_manager

        # Run one sync right away so widgets populate immediately after linking.
        await sync_manager.force_sync(provider_name)
        # Then keep background periodic sync running on the normal interval.
        await sync_manager.start_provider_sync(provider_name, run_immediately=False)

    # ── Cancel / Logout ─────────────────────────────────────────────────

    def cancel_login(self, provider_name: str) -> None:
        task = self._pending_polls.pop(provider_name, None)
        if task:
            task.cancel()
        self._pending_device_codes.pop(provider_name, None)

    async def logout(self, provider_name: str) -> None:
        self.cancel_login(provider_name)

        from backend.services.sync_service import sync_manager
        sync_manager.stop_provider_sync(provider_name)

        db: Session = SessionLocal()
        try:
            row = db.query(OAuthProvider).filter_by(provider=provider_name).first()
            if row:
                db.delete(row)
            # Remove provider-synced calendar/task rows so widgets clear immediately on disconnect.
            db.query(CalendarEvent).filter_by(provider=provider_name).delete(
                synchronize_session=False
            )
            db.commit()
        finally:
            db.close()

        await control_registry.broadcast({
            "type": "AUTH_STATE_CHANGED",
            "payload": {"provider": provider_name, "status": "disconnected"},
        })
        await control_registry.broadcast({
            "type": "CALENDAR_UPDATED",
            "payload": {
                "provider": provider_name,
                "events_count": 0,
                "tasks_count": 0,
                "synced_at": datetime.now(timezone.utc).isoformat(),
            },
        })

    # ── Token Access ────────────────────────────────────────────────────

    async def get_valid_token(self, provider_name: str) -> Optional[str]:
        """Return a valid access token, refreshing if expired."""
        db: Session = SessionLocal()
        try:
            row = db.query(OAuthProvider).filter_by(provider=provider_name).first()
            if row is None:
                return None

            now = datetime.now(timezone.utc)
            expiry = row.token_expiry.replace(tzinfo=timezone.utc) if row.token_expiry else now

            if now < expiry - timedelta(minutes=2):
                return decrypt_token(row.access_token_enc)

            provider = self._providers.get(provider_name)
            if not provider:
                return None

            try:
                refresh_tok = decrypt_token(row.refresh_token_enc)
                new_token = await provider.refresh_access_token(refresh_tok)
                row.access_token_enc = encrypt_token(new_token.access_token)
                if new_token.refresh_token:
                    row.refresh_token_enc = encrypt_token(new_token.refresh_token)
                row.token_expiry = now + timedelta(seconds=new_token.expires_in)
                row.status = "active"
                db.commit()
                return new_token.access_token
            except Exception:
                logger.exception("Token refresh failed for %s", provider_name)
                row.status = "needs_reauth"
                db.commit()
                await control_registry.broadcast({
                    "type": "AUTH_STATE_CHANGED",
                    "payload": {
                        "provider": provider_name,
                        "status": "needs_reauth",
                    },
                })
                return None
        finally:
            db.close()

    # ── Status Queries ──────────────────────────────────────────────────

    def get_login_status(self, provider_name: str) -> Dict[str, Any]:
        if provider_name in self._pending_polls and not self._pending_polls[provider_name].done():
            dc = self._pending_device_codes.get(provider_name)
            return {
                "provider": provider_name,
                "status": "pending",
                "message": dc.message if dc else None,
            }
        db: Session = SessionLocal()
        try:
            row = db.query(OAuthProvider).filter_by(provider=provider_name).first()
            if row:
                return {"provider": provider_name, "status": "complete"}
            return {"provider": provider_name, "status": "disconnected"}
        finally:
            db.close()

    def get_connected_providers(self) -> List[Dict[str, Any]]:
        db: Session = SessionLocal()
        try:
            rows = db.query(OAuthProvider).all()
            result = []
            for row in rows:
                result.append({
                    "provider": row.provider,
                    "connected": True,
                    "status": row.status,
                    "scopes": row.scopes,
                    "connected_at": row.created_at.isoformat() if row.created_at else None,
                })
            for name in self._providers:
                if not any(r["provider"] == name for r in result):
                    result.append({
                        "provider": name,
                        "connected": False,
                        "status": "disconnected",
                    })
            return result
        finally:
            db.close()


auth_manager = AuthManager()
