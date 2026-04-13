from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Type

import httpx
from sqlalchemy import or_
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from backend import config
from backend.database.models import (
    ClothingImage,
    ClothingItem,
    D1SyncCheckpoint,
    UserSettings,
    WidgetConfig,
)
from backend.database.session import SessionLocal
from backend.services.d1_conflict import remote_wins
from backend.services.realtime import control_registry

logger = logging.getLogger(__name__)

PULL_FLOOR_ISO = "1970-01-01T00:00:00Z"
BACKOFF_INITIAL_SEC = 5.0
BACKOFF_MAX_SEC = 300.0


class D1SyncService:
    TABLE_MODELS: Dict[str, Type[Any]] = {
        "widget_config": WidgetConfig,
        "user_settings": UserSettings,
        "clothing_item": ClothingItem,
        "clothing_image": ClothingImage,
    }
    TABLE_ORDER = ["widget_config", "user_settings", "clothing_item", "clothing_image"]

    def __init__(self) -> None:
        self.worker_url = config.D1_WORKER_URL.rstrip("/")
        self.sync_token = config.MIRROR_SYNC_TOKEN.strip()
        self.interval_sec = max(5, int(config.D1_SYNC_INTERVAL_SEC))
        self._task: Optional[asyncio.Task[Any]] = None
        self._stop_event = asyncio.Event()
        self._last_pull: Dict[str, str] = {table: PULL_FLOOR_ISO for table in self.TABLE_ORDER}

    @property
    def enabled(self) -> bool:
        return bool(self.worker_url and self.sync_token)

    async def start(self) -> None:
        if not self.enabled:
            logger.info("D1 sync disabled (missing D1_WORKER_URL or MIRROR_SYNC_TOKEN)")
            return
        if self._task and not self._task.done():
            return
        self._load_checkpoints()
        self._stop_event.clear()
        self._task = asyncio.create_task(self._sync_loop())
        logger.info("D1 sync loop started")

    async def stop(self) -> None:
        task = self._task
        if not task:
            return
        self._stop_event.set()
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        finally:
            self._task = None
        logger.info("D1 sync loop stopped")

    async def sync_all(self) -> None:
        widget_changed = False
        for table in self.TABLE_ORDER:
            await self.push(table)
            changed = await self.pull(table)
            if table == "widget_config" and changed:
                widget_changed = True
        if widget_changed:
            await control_registry.broadcast(
                {
                    "type": "WIDGETS_REMOTE_UPDATED",
                    "payload": {
                        "source": "d1",
                        "ts": datetime.now(timezone.utc).isoformat(),
                    },
                }
            )

    async def push(self, table_name: str) -> None:
        model = self.TABLE_MODELS[table_name]
        db: Session = SessionLocal()
        try:
            if hasattr(model, "updated_at"):
                dirty_rows = (
                    db.query(model)
                    .filter(or_(model.synced_at.is_(None), model.updated_at > model.synced_at))
                    .all()
                )
            else:
                dirty_rows = (
                    db.query(model)
                    .filter(or_(model.synced_at.is_(None), model.created_at > model.synced_at))
                    .all()
                )
            payload_rows = [self._serialize_row(table_name, row) for row in dirty_rows]
        finally:
            db.close()

        if not payload_rows:
            return

        response = await self._request(
            "POST",
            "/sync/push",
            params=None,
            json_body={"table": table_name, "rows": payload_rows},
        )
        if response is None:
            logger.warning("D1 push failed for %s: no response", table_name)
            return
        if response.status_code >= 400:
            logger.warning(
                "D1 push failed for %s: status=%s body=%s",
                table_name,
                response.status_code,
                response.text[:500],
            )
            return

        now = datetime.utcnow()
        ids = [int(row["id"]) for row in payload_rows if row.get("id") is not None]
        if not ids:
            return

        db = SessionLocal()
        try:
            rows = db.query(model).filter(model.id.in_(ids)).all()
            for row in rows:
                row.synced_at = now
            db.commit()
        finally:
            db.close()

    async def pull(self, table_name: str) -> bool:
        since = self._last_pull.get(table_name, PULL_FLOOR_ISO)
        response = await self._request(
            "GET",
            "/sync/pull",
            params={"table": table_name, "since": since},
            json_body=None,
        )
        if response is None:
            logger.warning("D1 pull failed for %s: no response", table_name)
            return False
        if response.status_code >= 400:
            logger.warning(
                "D1 pull failed for %s: status=%s body=%s",
                table_name,
                response.status_code,
                response.text[:500],
            )
            return False

        try:
            data = response.json()
        except ValueError:
            logger.warning("D1 pull returned non-JSON for %s: body=%s", table_name, response.text[:500])
            return False

        rows = data.get("rows", [])
        if not isinstance(rows, list) or not rows:
            self._set_last_pull(table_name, datetime.now(timezone.utc))
            return False

        changed = self._merge_remote_rows(table_name, rows)
        self._set_last_pull(table_name, datetime.now(timezone.utc))
        return changed

    async def _sync_loop(self) -> None:
        backoff = BACKOFF_INITIAL_SEC
        while not self._stop_event.is_set():
            try:
                await self.sync_all()
                backoff = BACKOFF_INITIAL_SEC
                await asyncio.wait_for(self._stop_event.wait(), timeout=self.interval_sec)
            except asyncio.TimeoutError:
                continue
            except asyncio.CancelledError:
                break
            except Exception:
                logger.exception("Unexpected D1 sync loop error, backing off %.0fs", backoff)
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, BACKOFF_MAX_SEC)

    async def _request(
        self,
        method: str,
        path: str,
        params: Optional[Dict[str, str]],
        json_body: Optional[Dict[str, Any]],
    ) -> Optional[httpx.Response]:
        if not self.enabled:
            return None
        headers = {"Authorization": f"Bearer {self.sync_token}"}
        url = f"{self.worker_url}{path}"
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                return await client.request(method, url, params=params, json=json_body, headers=headers)
        except Exception as exc:
            logger.warning("D1 %s %s request exception: %s", method, path, exc)
            return None

    def _serialize_row(self, table_name: str, row: Any) -> Dict[str, Any]:
        if table_name == "widget_config":
            return {
                "id": row.id,
                "widget_id": row.widget_id,
                "enabled": row.enabled,
                "position_row": row.position_row,
                "position_col": row.position_col,
                "size_rows": row.size_rows,
                "size_cols": row.size_cols,
                "config_json": row.config_json or {},
                "created_at": self._to_iso(row.created_at),
                "updated_at": self._to_iso(row.updated_at),
                "synced_at": self._to_iso(row.synced_at),
            }
        if table_name == "user_settings":
            return {
                "id": row.id,
                "theme": row.theme,
                "primary_font_size": row.primary_font_size,
                "accent_color": row.accent_color,
                "created_at": self._to_iso(row.created_at),
                "updated_at": self._to_iso(row.updated_at),
                "synced_at": self._to_iso(row.synced_at),
            }
        if table_name == "clothing_item":
            return {
                "id": row.id,
                "name": row.name,
                "category": row.category,
                "color": row.color,
                "season": row.season,
                "notes": row.notes,
                "created_at": self._to_iso(row.created_at),
                "updated_at": self._to_iso(row.updated_at),
                "synced_at": self._to_iso(row.synced_at),
            }
        return {
            "id": row.id,
            "clothing_item_id": row.clothing_item_id,
            "storage_provider": row.storage_provider,
            "storage_key": row.storage_key,
            "image_url": row.image_url,
            "created_at": self._to_iso(row.created_at),
            "synced_at": self._to_iso(row.synced_at),
        }

    def _merge_remote_rows(self, table_name: str, rows: List[Dict[str, Any]]) -> bool:
        model = self.TABLE_MODELS[table_name]
        changed = False
        db = SessionLocal()
        now = datetime.utcnow()
        try:
            for incoming in rows:
                row_id = incoming.get("id")
                if row_id is None:
                    continue
                existing = db.query(model).filter_by(id=row_id).first()
                remote_updated = incoming.get("updated_at") or incoming.get("created_at")
                if existing is None:
                    entity = model(id=row_id)
                    db.add(entity)
                    self._apply_incoming_row(table_name, entity, incoming, now)
                    changed = True
                    continue

                local_updated = getattr(existing, "updated_at", None) or getattr(existing, "created_at", None)
                if not remote_wins(table_name, row_id, local_updated, remote_updated):
                    continue
                self._apply_incoming_row(table_name, existing, incoming, now)
                changed = True
            db.commit()
        finally:
            db.close()
        return changed

    def _apply_incoming_row(self, table_name: str, entity: Any, incoming: Dict[str, Any], synced_at: datetime) -> None:
        if table_name == "widget_config":
            entity.widget_id = incoming.get("widget_id")
            entity.enabled = bool(incoming.get("enabled", True))
            entity.position_row = incoming.get("position_row", 1)
            entity.position_col = incoming.get("position_col", 1)
            entity.size_rows = incoming.get("size_rows", 1)
            entity.size_cols = incoming.get("size_cols", 1)
            entity.config_json = self._json_value(incoming.get("config_json"))
            entity.created_at = self._parse_datetime(incoming.get("created_at")) or entity.created_at
            entity.updated_at = self._parse_datetime(incoming.get("updated_at")) or datetime.utcnow()
        elif table_name == "user_settings":
            entity.theme = incoming.get("theme", "dark")
            entity.primary_font_size = incoming.get("primary_font_size", 72)
            entity.accent_color = incoming.get("accent_color", "#4a9eff")
            entity.created_at = self._parse_datetime(incoming.get("created_at")) or entity.created_at
            entity.updated_at = self._parse_datetime(incoming.get("updated_at")) or datetime.utcnow()
        elif table_name == "clothing_item":
            entity.name = incoming.get("name")
            entity.category = incoming.get("category")
            entity.color = incoming.get("color")
            entity.season = incoming.get("season")
            entity.notes = incoming.get("notes")
            entity.created_at = self._parse_datetime(incoming.get("created_at")) or entity.created_at
            entity.updated_at = self._parse_datetime(incoming.get("updated_at")) or datetime.utcnow()
        elif table_name == "clothing_image":
            entity.clothing_item_id = incoming.get("clothing_item_id")
            entity.storage_provider = incoming.get("storage_provider", "cloud")
            entity.storage_key = incoming.get("storage_key")
            entity.image_url = incoming.get("image_url")
            entity.created_at = self._parse_datetime(incoming.get("created_at")) or datetime.utcnow()
        entity.synced_at = synced_at

    @staticmethod
    def _json_value(value: Any) -> Dict[str, Any]:
        if isinstance(value, dict):
            return value
        if isinstance(value, str):
            try:
                parsed = json.loads(value)
                if isinstance(parsed, dict):
                    return parsed
            except ValueError:
                return {}
        return {}

    @staticmethod
    def _parse_datetime(value: Any) -> Optional[datetime]:
        if value is None:
            return None
        if isinstance(value, datetime):
            return value
        text = str(value).strip()
        if not text:
            return None
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        try:
            return datetime.fromisoformat(text).replace(tzinfo=None)
        except ValueError:
            return None

    @staticmethod
    def _to_iso(value: Optional[datetime]) -> Optional[str]:
        if value is None:
            return None
        return value.replace(tzinfo=timezone.utc).isoformat()

    def _load_checkpoints(self) -> None:
        db = SessionLocal()
        try:
            rows = (
                db.query(D1SyncCheckpoint)
                .filter(D1SyncCheckpoint.table_name.in_(self.TABLE_ORDER))
                .all()
            )
            for row in rows:
                self._last_pull[row.table_name] = self._to_iso(row.last_pull_at) or PULL_FLOOR_ISO
        except OperationalError:
            logger.warning("D1 checkpoint table missing; using in-memory pull checkpoints")
        finally:
            db.close()

    def _set_last_pull(self, table_name: str, pulled_at: datetime) -> None:
        pulled_utc = pulled_at.astimezone(timezone.utc)
        self._last_pull[table_name] = pulled_utc.isoformat()
        db = SessionLocal()
        try:
            row = db.query(D1SyncCheckpoint).filter_by(table_name=table_name).first()
            if row is None:
                row = D1SyncCheckpoint(
                    table_name=table_name,
                    last_pull_at=pulled_utc.replace(tzinfo=None),
                )
                db.add(row)
            else:
                row.last_pull_at = pulled_utc.replace(tzinfo=None)
            db.commit()
        except OperationalError:
            db.rollback()
            logger.warning("D1 checkpoint table missing; skipping persisted checkpoint write")
        finally:
            db.close()


d1_sync_service = D1SyncService()
