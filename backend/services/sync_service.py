"""
Background sync service — runs one asyncio task per connected provider,
fetching calendar events and tasks on a configurable interval with
exponential backoff on failure.
"""

from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from backend.database.models import CalendarEvent, OAuthProvider
from backend.database.session import SessionLocal
from backend.services.providers.base import NormalizedEvent
from backend.services.realtime import control_registry

logger = logging.getLogger(__name__)

DEFAULT_SYNC_INTERVAL = 300  # 5 minutes
BACKOFF_INITIAL = 5.0
BACKOFF_MAX = 300.0


class SyncManager:
    def __init__(self) -> None:
        self._tasks: Dict[str, asyncio.Task[Any]] = {}
        self._last_sync: Dict[str, str] = {}

    @property
    def sync_interval(self) -> int:
        try:
            return int(os.getenv("MIRROR_SYNC_INTERVAL_SEC", DEFAULT_SYNC_INTERVAL))
        except ValueError:
            return DEFAULT_SYNC_INTERVAL

    def get_last_sync(self, provider: str) -> Optional[str]:
        return self._last_sync.get(provider)

    # ── Lifecycle ───────────────────────────────────────────────────────

    async def start_all(self) -> None:
        """Start sync loops for all providers that are already connected in DB."""
        db: Session = SessionLocal()
        try:
            rows = db.query(OAuthProvider).filter_by(status="active").all()
            for row in rows:
                await self.start_provider_sync(row.provider)
        finally:
            db.close()

    async def start_provider_sync(self, provider_name: str) -> None:
        if provider_name in self._tasks and not self._tasks[provider_name].done():
            return
        task = asyncio.create_task(self._sync_loop(provider_name))
        self._tasks[provider_name] = task
        logger.info("Started sync loop for %s", provider_name)

    def stop_provider_sync(self, provider_name: str) -> None:
        task = self._tasks.pop(provider_name, None)
        if task:
            task.cancel()
            logger.info("Stopped sync loop for %s", provider_name)

    def stop_all(self) -> None:
        for name in list(self._tasks):
            self.stop_provider_sync(name)

    # ── Sync Loop ───────────────────────────────────────────────────────

    async def _sync_loop(self, provider_name: str) -> None:
        backoff = BACKOFF_INITIAL
        # Do an initial sync immediately
        first_run = True
        while True:
            try:
                if not first_run:
                    await asyncio.sleep(self.sync_interval)
                first_run = False

                await self._do_sync(provider_name)
                backoff = BACKOFF_INITIAL
            except asyncio.CancelledError:
                break
            except Exception:
                logger.exception("Sync failed for %s, backing off %.0fs", provider_name, backoff)
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, BACKOFF_MAX)

    async def _do_sync(self, provider_name: str) -> None:
        from backend.services.auth_manager import auth_manager

        token = await auth_manager.get_valid_token(provider_name)
        if token is None:
            logger.warning("No valid token for %s, skipping sync", provider_name)
            return

        provider = auth_manager.get_provider(provider_name)
        if provider is None:
            return

        events: List[NormalizedEvent] = []
        tasks: List[NormalizedEvent] = []

        try:
            events = await provider.fetch_events(token)
        except PermissionError:
            token = await auth_manager.get_valid_token(provider_name)
            if token:
                events = await provider.fetch_events(token)
        except Exception:
            logger.exception("Failed to fetch events from %s", provider_name)

        try:
            tasks = await provider.fetch_tasks(token or "")
        except PermissionError:
            token = await auth_manager.get_valid_token(provider_name)
            if token:
                tasks = await provider.fetch_tasks(token)
        except Exception:
            logger.exception("Failed to fetch tasks from %s", provider_name)

        all_items = events + tasks
        if all_items:
            self._upsert_events(provider_name, all_items)

        now_iso = datetime.now(timezone.utc).isoformat()
        self._last_sync[provider_name] = now_iso

        await control_registry.broadcast({
            "type": "CALENDAR_UPDATED",
            "payload": {
                "provider": provider_name,
                "events_count": len(events),
                "tasks_count": len(tasks),
                "synced_at": now_iso,
            },
        })
        logger.info(
            "Synced %s: %d events, %d tasks",
            provider_name, len(events), len(tasks),
        )

    # ── DB Upsert ───────────────────────────────────────────────────────

    @staticmethod
    def _upsert_events(provider_name: str, items: List[NormalizedEvent]) -> None:
        db: Session = SessionLocal()
        now = datetime.now(timezone.utc)
        try:
            for item in items:
                row = (
                    db.query(CalendarEvent)
                    .filter_by(provider=provider_name, external_id=item.external_id)
                    .first()
                )
                start_dt = _parse_dt(item.start_time)
                end_dt = _parse_dt(item.end_time)
                if row is None:
                    row = CalendarEvent(
                        provider=provider_name,
                        external_id=item.external_id,
                        event_type=item.event_type,
                        title=item.title,
                        start_time=start_dt,
                        end_time=end_dt,
                        all_day=item.all_day,
                        priority=item.priority,
                        completed=item.completed,
                        metadata_json=item.metadata,
                        synced_at=now,
                    )
                    db.add(row)
                else:
                    row.title = item.title
                    row.event_type = item.event_type
                    row.start_time = start_dt
                    row.end_time = end_dt
                    row.all_day = item.all_day
                    row.priority = item.priority
                    row.completed = item.completed
                    row.metadata_json = item.metadata
                    row.synced_at = now
            db.commit()
        finally:
            db.close()

    # ── Force Sync ──────────────────────────────────────────────────────

    async def force_sync(self, provider_name: Optional[str] = None) -> None:
        if provider_name:
            await self._do_sync(provider_name)
        else:
            db: Session = SessionLocal()
            try:
                rows = db.query(OAuthProvider).filter_by(status="active").all()
                names = [r.provider for r in rows]
            finally:
                db.close()
            for name in names:
                await self._do_sync(name)


def _parse_dt(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    for fmt in ("%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%S.%f%z", "%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%d"):
        try:
            return datetime.strptime(value, fmt)
        except ValueError:
            continue
    try:
        # Fall back: strip trailing 'Z' and parse naive
        clean = value.rstrip("Z")
        return datetime.fromisoformat(clean)
    except ValueError:
        logger.warning("Could not parse datetime: %s", value)
        return None


sync_manager = SyncManager()
