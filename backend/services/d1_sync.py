from __future__ import annotations

import asyncio
import json
import logging
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Type
from urllib.parse import urlparse

import httpx
from sqlalchemy import func, or_
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Query, Session

from backend import config
from backend.database.models import D1SyncCheckpoint, Mirror, UserProfile, UserSettings, WidgetConfig
from backend.database.session import SessionLocal
from backend.services.d1_conflict import remote_wins
from backend.services.datetime_utils import parse_datetime_utc_naive, to_iso_utc_z
from backend.services.realtime import control_registry

logger = logging.getLogger(__name__)

PULL_FLOOR_ISO = "1970-01-01T00:00:00Z"
BACKOFF_INITIAL_SEC = 5.0
BACKOFF_MAX_SEC = 300.0


@dataclass
class MergeOutcome:
    changed: bool
    persisted: bool


class D1SyncService:
    TABLE_MODELS: Dict[str, Type[Any]] = {
        "mirrors": Mirror,
        "user_profiles": UserProfile,
        "widget_config": WidgetConfig,
        "user_settings": UserSettings,
    }
    TABLE_ORDER = ["mirrors", "user_profiles", "widget_config", "user_settings"]
    ROW_KEY_FIELDS = {
        "mirrors": "id",
        "user_profiles": "sync_id",
        "widget_config": "sync_id",
        "user_settings": "sync_id",
    }

    def __init__(self) -> None:
        self.worker_url = config.D1_WORKER_URL.rstrip("/")
        self.sync_token = config.MIRROR_SYNC_TOKEN.strip()
        self.interval_sec = max(5, int(config.D1_SYNC_INTERVAL_SEC))
        self._task: Optional[asyncio.Task[Any]] = None
        self._stop_event = asyncio.Event()
        self._remote_cursor_iso: Dict[str, str] = {table: PULL_FLOOR_ISO for table in self.TABLE_ORDER}
        self._remote_cursor_id: Dict[str, int] = {table: 0 for table in self.TABLE_ORDER}
        self._force_full_sync_pending = False
        self._local_readonly_mode = False

    @property
    def enabled(self) -> bool:
        return bool(self.worker_url and self.sync_token)

    async def start(self) -> None:
        if not self.enabled:
            logger.info("D1 sync disabled (missing D1_WORKER_URL or MIRROR_SYNC_TOKEN)")
            return
        if self._task and not self._task.done():
            return
        if _sqlite_local_db_is_readonly():
            self._local_readonly_mode = True
            logger.warning(
                "D1 sync disabled [code=LOCAL_DB_READONLY_AT_STARTUP]: local SQLite database is readonly"
            )
            return
        self._load_checkpoints()
        self._force_full_sync_pending = bool(config.D1_FORCE_FULL_SYNC)
        if self._force_full_sync_pending:
            self._reset_remote_cursors_to_floor()
            logger.info("D1_FORCE_FULL_SYNC: remote pull cursors reset to floor; next sync will re-pull from D1")
        self._stop_event.clear()
        self._task = asyncio.create_task(self._sync_loop())
        host = urlparse(self.worker_url).netloc or self.worker_url
        logger.info("D1 sync loop started (worker host: %s)", host)

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
        if self._local_readonly_mode:
            return
        mirror_id = self._current_mirror_id()
        if not mirror_id:
            return
        widget_changed = False
        for table in self.TABLE_ORDER:
            await self.push(table, mirror_id)
            want_full = self._force_full_sync_pending or await self._detect_drift_full_pull(table, mirror_id)
            changed = await self.pull(table, mirror_id, full=want_full)
            if table == "widget_config" and changed:
                widget_changed = True
        if self._force_full_sync_pending:
            self._force_full_sync_pending = False
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

    async def push(self, table_name: str, mirror_id: str) -> None:
        model = self.TABLE_MODELS[table_name]
        db: Session = SessionLocal()
        try:
            order_attr = self._order_column_attr(model)
            dirty_rows = (
                self._scoped_query(db.query(model), table_name, mirror_id)
                .filter(or_(model.synced_at.is_(None), order_attr > model.synced_at))
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
            params={"table": table_name, "mirror_id": mirror_id},
            json_body={"rows": payload_rows},
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

        try:
            body = response.json()
        except ValueError:
            body = {}
        accepted_keys_raw = body.get("accepted_keys") if isinstance(body, dict) else None
        if isinstance(accepted_keys_raw, list):
            accepted_keys = [str(value).strip() for value in accepted_keys_raw if str(value).strip()]
        else:
            logger.warning(
                "D1 push protocol error for %s [code=D1_PUSH_ACCEPTED_KEYS_MISSING]: status=%s body=%s",
                table_name,
                response.status_code,
                response.text[:500],
            )
            return

        if not accepted_keys:
            return

        db = SessionLocal()
        now = datetime.utcnow()
        try:
            key_attr = getattr(model, self.ROW_KEY_FIELDS[table_name])
            rows = (
                self._scoped_query(db.query(model), table_name, mirror_id)
                .filter(key_attr.in_(accepted_keys))
                .all()
            )
            for row in rows:
                row.synced_at = now
            try:
                db.commit()
            except Exception as exc:
                db.rollback()
                if _is_sqlite_readonly_error(exc):
                    self._local_readonly_mode = True
                    logger.warning(
                        "D1 push local marker skipped for %s [code=LOCAL_DB_READONLY_SYNCED_AT_SKIPPED, accepted_remote=%d, pushed_rows=%d]; disabling D1 sync until restart",
                        table_name,
                        len(accepted_keys),
                        len(payload_rows),
                    )
                else:
                    raise
        finally:
            db.close()

    async def pull(self, table_name: str, mirror_id: str, *, full: bool = False) -> bool:
        since = self._remote_cursor_iso.get(table_name, PULL_FLOOR_ISO)
        params: Dict[str, str] = {"table": table_name, "since": since, "mirror_id": mirror_id}
        if full:
            params["full"] = "1"
        response = await self._request("GET", "/sync/pull", params=params, json_body=None)
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
            self._touch_last_pull_at(table_name)
            return False

        merge = self._merge_remote_rows(table_name, rows)
        if not merge.persisted:
            logger.warning(
                "D1 pull for %s returned %d rows but local merge did not persist; cursor unchanged for retry",
                table_name,
                len(rows),
            )
            return False

        max_cursor_iso = self._max_remote_cursor(table_name, rows)
        if max_cursor_iso is None:
            max_cursor_iso = self._utc_now_iso_z()
            logger.warning(
                "D1 pull had rows but no parseable order column for %s; using wall-clock cursor fallback",
                table_name,
            )
        self._persist_remote_cursor(table_name, max_cursor_iso, 0)
        self._touch_last_pull_at(table_name)
        return merge.changed

    async def _detect_drift_full_pull(self, table_name: str, mirror_id: str) -> bool:
        stats = await self._fetch_table_stats(table_name, mirror_id)
        if stats is None:
            return False
        local = self._local_table_stats(table_name, mirror_id)
        if local is None:
            return False
        remote_count = int(stats.get("count", 0))
        local_count = local["count"]
        if remote_count != local_count:
            logger.info(
                "D1 drift: remote count %s != local %s for %s; full pull",
                remote_count,
                local_count,
                table_name,
            )
            return True
        remote_max = stats.get("max_order")
        local_max = local["max_order"]
        if remote_max is not None and local_max is not None:
            if self._remote_order_ts_ms(remote_max) > self._local_order_ts_ms(local_max):
                logger.info("D1 drift: remote max_order newer than local for %s; full pull", table_name)
                return True
        return False

    async def _fetch_table_stats(self, table_name: str, mirror_id: str) -> Optional[Dict[str, Any]]:
        response = await self._request(
            "GET",
            "/sync/stats",
            params={"table": table_name, "mirror_id": mirror_id},
            json_body=None,
        )
        if response is None or response.status_code >= 400:
            return None
        try:
            data = response.json()
        except ValueError:
            return None
        if not isinstance(data, dict) or data.get("error"):
            return None
        return data

    def _local_table_stats(self, table_name: str, mirror_id: str) -> Optional[Dict[str, Any]]:
        model = self.TABLE_MODELS[table_name]
        order_attr = self._order_column_attr(model)
        db = SessionLocal()
        try:
            query = self._scoped_query(db.query(model), table_name, mirror_id)
            count = int(query.with_entities(func.count()).scalar() or 0)
            max_val = query.with_entities(func.max(order_attr)).scalar()
            return {"count": count, "max_order": max_val}
        finally:
            db.close()

    @staticmethod
    def _order_column_attr(model: Type[Any]) -> Any:
        return getattr(model, "updated_at", model.created_at)

    @staticmethod
    def _utc_now_iso_z() -> str:
        return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    @classmethod
    def _local_order_ts_ms(cls, value: Any) -> float:
        if value is None:
            return float("-inf")
        dt = parse_datetime_utc_naive(value)
        if dt is None:
            return float("-inf")
        return float(dt.replace(tzinfo=timezone.utc).timestamp()) * 1000.0

    @classmethod
    def _remote_order_ts_ms(cls, value: Any) -> float:
        if value is None:
            return float("-inf")
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            numeric = float(value)
            return numeric if numeric > 1e12 else numeric * 1000.0
        text = str(value).strip()
        if not text:
            return float("-inf")
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        elif " " in text and "T" not in text.split(" ", 1)[0]:
            text = text.replace(" ", "T", 1)
        if "+" not in text and not text.endswith("Z"):
            text = text + "+00:00"
        try:
            return datetime.fromisoformat(text).timestamp() * 1000.0
        except ValueError:
            return float("-inf")

    def _reset_remote_cursors_to_floor(self) -> None:
        for table in self.TABLE_ORDER:
            self._remote_cursor_iso[table] = PULL_FLOOR_ISO
            self._remote_cursor_id[table] = 0
        db = SessionLocal()
        try:
            for table in self.TABLE_ORDER:
                row = db.query(D1SyncCheckpoint).filter_by(table_name=table).first()
                if row is None:
                    row = D1SyncCheckpoint(
                        table_name=table,
                        last_pull_at=datetime.utcnow(),
                        last_remote_cursor=None,
                    )
                    db.add(row)
                else:
                    row.last_remote_cursor = None
                    row.last_remote_cursor_id = None
            db.commit()
        except OperationalError as exc:
            db.rollback()
            category = _classify_sqlite_operational_error(exc)
            if category == "missing_table":
                logger.warning("D1 checkpoint table missing; skipping cursor reset persist")
            elif category == "readonly":
                logger.warning("D1 checkpoint cursor reset skipped because local DB is readonly")
            else:
                logger.warning("D1 checkpoint cursor reset persist failed: %s", exc)
        finally:
            db.close()

    def _persist_remote_cursor(self, table_name: str, cursor_iso: str, cursor_id: int) -> None:
        self._remote_cursor_iso[table_name] = cursor_iso
        self._remote_cursor_id[table_name] = cursor_id
        db = SessionLocal()
        try:
            row = db.query(D1SyncCheckpoint).filter_by(table_name=table_name).first()
            if row is None:
                row = D1SyncCheckpoint(
                    table_name=table_name,
                    last_pull_at=datetime.utcnow(),
                    last_remote_cursor=cursor_iso,
                    last_remote_cursor_id=cursor_id,
                )
                db.add(row)
            else:
                row.last_remote_cursor = cursor_iso
                row.last_remote_cursor_id = cursor_id
            db.commit()
        except OperationalError as exc:
            db.rollback()
            category = _classify_sqlite_operational_error(exc)
            if category == "missing_table":
                logger.warning("D1 checkpoint table missing; skipping remote cursor persist")
            elif category == "readonly":
                logger.warning(
                    "D1 remote cursor persist skipped for %s because local DB is readonly",
                    table_name,
                )
            else:
                logger.warning("D1 remote cursor persist failed for %s: %s", table_name, exc)
        finally:
            db.close()

    def _touch_last_pull_at(self, table_name: str) -> None:
        now = datetime.utcnow()
        db = SessionLocal()
        try:
            row = db.query(D1SyncCheckpoint).filter_by(table_name=table_name).first()
            if row is None:
                row = D1SyncCheckpoint(
                    table_name=table_name,
                    last_pull_at=now,
                    last_remote_cursor=None,
                )
                db.add(row)
            else:
                row.last_pull_at = now
            db.commit()
        except OperationalError as exc:
            db.rollback()
            category = _classify_sqlite_operational_error(exc)
            if category == "missing_table":
                logger.warning("D1 checkpoint table missing; skipping last_pull_at touch")
            elif category == "readonly":
                logger.warning(
                    "D1 last_pull_at touch skipped for %s because local DB is readonly",
                    table_name,
                )
            else:
                logger.warning("D1 last_pull_at touch failed for %s: %s", table_name, exc)
        finally:
            db.close()

    def _max_remote_cursor(self, table_name: str, rows: List[Dict[str, Any]]) -> Optional[str]:
        best_iso: Optional[str] = None
        best_ms = float("-inf")
        best_key = ""
        key_field = self.ROW_KEY_FIELDS[table_name]
        for incoming in rows:
            raw = incoming.get("updated_at") or incoming.get("created_at")
            if raw is None:
                continue
            ms = self._remote_order_ts_ms(raw)
            row_key = str(incoming.get(key_field) or "")
            if ms > best_ms or (ms == best_ms and row_key > best_key):
                best_ms = ms
                best_key = row_key
                best_iso = self._normalize_remote_cursor_iso(raw)
        return best_iso

    @classmethod
    def _normalize_remote_cursor_iso(cls, raw: Any) -> str:
        if isinstance(raw, datetime):
            return to_iso_utc_z(raw) or PULL_FLOOR_ISO
        if isinstance(raw, (int, float)) and not isinstance(raw, bool):
            ms = cls._remote_order_ts_ms(raw)
            if ms == float("-inf"):
                return PULL_FLOOR_ISO
            return (
                datetime.fromtimestamp(ms / 1000.0, tz=timezone.utc)
                .isoformat()
                .replace("+00:00", "Z")
            )
        return to_iso_utc_z(raw) or str(raw).strip() or PULL_FLOOR_ISO

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
            async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
                return await client.request(method, url, params=params, json=json_body, headers=headers)
        except Exception as exc:
            logger.warning(
                "D1 %s %s request exception (%s): %s",
                method,
                path,
                urlparse(url).netloc or "?",
                exc,
            )
            return None

    def _serialize_row(self, table_name: str, row: Any) -> Dict[str, Any]:
        if table_name == "mirrors":
            return {
                "id": row.id,
                "hardware_id": row.hardware_id,
                "friendly_name": row.friendly_name,
                "claimed_by_user_uid": row.claimed_by_user_uid,
                "claimed_at": self._to_iso(row.claimed_at),
                "created_at": self._to_iso(row.created_at),
                "updated_at": self._to_iso(row.updated_at),
                "synced_at": self._to_iso(row.synced_at),
            }
        if table_name == "user_profiles":
            return {
                "sync_id": row.sync_id,
                "mirror_id": row.mirror_id,
                "user_id": row.user_id,
                "display_name": row.display_name,
                "widget_config": row.widget_config or {},
                "is_active": row.is_active,
                "created_at": self._to_iso(row.created_at),
                "updated_at": self._to_iso(row.updated_at),
                "deleted_at": self._to_iso(row.deleted_at),
                "synced_at": self._to_iso(row.synced_at),
            }
        if table_name == "widget_config":
            return {
                "sync_id": row.sync_id,
                "mirror_id": row.mirror_id,
                "user_id": row.user_id,
                "widget_id": row.widget_id,
                "enabled": row.enabled,
                "position_row": row.position_row,
                "position_col": row.position_col,
                "size_rows": row.size_rows,
                "size_cols": row.size_cols,
                "config_json": row.config_json or {},
                "created_at": self._to_iso(row.created_at),
                "updated_at": self._to_iso(row.updated_at),
                "deleted_at": self._to_iso(row.deleted_at),
                "synced_at": self._to_iso(row.synced_at),
            }
        return {
            "sync_id": row.sync_id,
            "mirror_id": row.mirror_id,
            "user_id": row.user_id,
            "theme": row.theme,
            "primary_font_size": row.primary_font_size,
            "accent_color": row.accent_color,
            "created_at": self._to_iso(row.created_at),
            "updated_at": self._to_iso(row.updated_at),
            "deleted_at": self._to_iso(row.deleted_at),
            "synced_at": self._to_iso(row.synced_at),
        }

    def _merge_remote_rows(self, table_name: str, rows: List[Dict[str, Any]]) -> MergeOutcome:
        model = self.TABLE_MODELS[table_name]
        changed = False
        db = SessionLocal()
        now = datetime.utcnow()
        try:
            for incoming in rows:
                existing = self._find_existing_entity(db, table_name, incoming)
                remote_updated = incoming.get("updated_at") or incoming.get("created_at")
                if existing is None:
                    entity = model()
                    db.add(entity)
                    self._apply_incoming_row(table_name, entity, incoming, now)
                    changed = True
                    continue

                local_updated = getattr(existing, "updated_at", None) or getattr(existing, "created_at", None)
                row_key = incoming.get(self.ROW_KEY_FIELDS[table_name]) or getattr(
                    existing, self.ROW_KEY_FIELDS[table_name], None
                )
                if not remote_wins(table_name, row_key, local_updated, remote_updated):
                    continue
                self._apply_incoming_row(table_name, existing, incoming, now)
                changed = True
            try:
                db.commit()
            except Exception as exc:
                db.rollback()
                if _is_sqlite_readonly_error(exc):
                    self._local_readonly_mode = True
                    logger.warning(
                        "D1 pull merge could not write %s because local DB is readonly [code=LOCAL_DB_READONLY_PULL_MERGE]; disabling D1 sync until restart",
                        table_name,
                    )
                    return MergeOutcome(changed=False, persisted=False)
                raise
        finally:
            db.close()
        return MergeOutcome(changed=changed, persisted=True)

    def _find_existing_entity(self, db: Session, table_name: str, incoming: Dict[str, Any]) -> Any | None:
        model = self.TABLE_MODELS[table_name]
        row_key = str(incoming.get(self.ROW_KEY_FIELDS[table_name]) or "").strip()
        if table_name == "mirrors":
            existing = db.query(model).filter(model.id == row_key).first() if row_key else None
            if existing is None:
                hardware_id = str(incoming.get("hardware_id") or "").strip()
                if hardware_id:
                    existing = db.query(model).filter(model.hardware_id == hardware_id).first()
            return existing
        if row_key:
            existing = db.query(model).filter(model.sync_id == row_key).first()
            if existing is not None:
                return existing
        if table_name == "user_profiles":
            return (
                db.query(model)
                .filter(model.mirror_id == incoming.get("mirror_id"), model.user_id == incoming.get("user_id"))
                .first()
            )
        if table_name == "user_settings":
            return (
                db.query(model)
                .filter(model.mirror_id == incoming.get("mirror_id"), model.user_id == incoming.get("user_id"))
                .first()
            )
        return (
            db.query(model)
            .filter(
                model.mirror_id == incoming.get("mirror_id"),
                model.user_id == incoming.get("user_id"),
                model.widget_id == incoming.get("widget_id"),
            )
            .first()
        )

    def _apply_incoming_row(self, table_name: str, entity: Any, incoming: Dict[str, Any], synced_at: datetime) -> None:
        if table_name == "mirrors":
            entity.id = incoming.get("id") or entity.id
            entity.hardware_id = incoming.get("hardware_id") or entity.hardware_id
            entity.friendly_name = incoming.get("friendly_name")
            entity.claimed_by_user_uid = incoming.get("claimed_by_user_uid")
            entity.claimed_at = self._parse_datetime(incoming.get("claimed_at"))
            entity.created_at = self._parse_datetime(incoming.get("created_at")) or entity.created_at
            entity.updated_at = self._parse_datetime(incoming.get("updated_at")) or datetime.utcnow()
        elif table_name == "user_profiles":
            entity.sync_id = incoming.get("sync_id") or entity.sync_id
            entity.mirror_id = self._incoming_or_existing(entity, incoming, "mirror_id")
            entity.user_id = self._incoming_or_existing(entity, incoming, "user_id")
            entity.display_name = incoming.get("display_name")
            entity.widget_config = self._json_value(incoming.get("widget_config"))
            entity.is_active = bool(incoming.get("is_active", False))
            entity.created_at = self._parse_datetime(incoming.get("created_at")) or entity.created_at
            entity.updated_at = self._parse_datetime(incoming.get("updated_at")) or datetime.utcnow()
            entity.deleted_at = self._parse_datetime(incoming.get("deleted_at"))
        elif table_name == "widget_config":
            entity.sync_id = incoming.get("sync_id") or entity.sync_id
            entity.mirror_id = self._incoming_or_existing(entity, incoming, "mirror_id")
            entity.user_id = self._incoming_or_existing(entity, incoming, "user_id")
            entity.widget_id = incoming.get("widget_id")
            entity.enabled = bool(incoming.get("enabled", True))
            entity.position_row = incoming.get("position_row", 1)
            entity.position_col = incoming.get("position_col", 1)
            entity.size_rows = incoming.get("size_rows", 1)
            entity.size_cols = incoming.get("size_cols", 1)
            entity.config_json = self._json_value(incoming.get("config_json"))
            entity.created_at = self._parse_datetime(incoming.get("created_at")) or entity.created_at
            entity.updated_at = self._parse_datetime(incoming.get("updated_at")) or datetime.utcnow()
            entity.deleted_at = self._parse_datetime(incoming.get("deleted_at"))
        else:
            entity.sync_id = incoming.get("sync_id") or entity.sync_id
            entity.mirror_id = self._incoming_or_existing(entity, incoming, "mirror_id")
            entity.user_id = self._incoming_or_existing(entity, incoming, "user_id")
            entity.theme = incoming.get("theme", "dark")
            entity.primary_font_size = incoming.get("primary_font_size", 72)
            entity.accent_color = incoming.get("accent_color", "#4a9eff")
            entity.created_at = self._parse_datetime(incoming.get("created_at")) or entity.created_at
            entity.updated_at = self._parse_datetime(incoming.get("updated_at")) or datetime.utcnow()
            entity.deleted_at = self._parse_datetime(incoming.get("deleted_at"))
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
        return parse_datetime_utc_naive(value)

    @staticmethod
    def _incoming_or_existing(entity: Any, incoming: Dict[str, Any], field: str) -> Any:
        value = incoming.get(field)
        return value if value is not None else getattr(entity, field, None)

    @staticmethod
    def _to_iso(value: Optional[datetime]) -> Optional[str]:
        return to_iso_utc_z(value)

    def _load_checkpoints(self) -> None:
        db = SessionLocal()
        try:
            rows = db.query(D1SyncCheckpoint).filter(D1SyncCheckpoint.table_name.in_(self.TABLE_ORDER)).all()
            for row in rows:
                self._remote_cursor_iso[row.table_name] = self._checkpoint_cursor_iso(row)
                self._remote_cursor_id[row.table_name] = int(row.last_remote_cursor_id or 0)
        except OperationalError:
            logger.warning("D1 checkpoint table missing; using in-memory pull checkpoints")
        finally:
            db.close()

    @staticmethod
    def _checkpoint_cursor_iso(row: D1SyncCheckpoint) -> str:
        if isinstance(row.last_remote_cursor, str) and row.last_remote_cursor.strip():
            return row.last_remote_cursor.strip()
        return PULL_FLOOR_ISO

    def _current_mirror_id(self) -> Optional[str]:
        db = SessionLocal()
        try:
            mirror = db.query(Mirror).order_by(Mirror.created_at.asc()).first()
            return mirror.id if mirror is not None else None
        finally:
            db.close()

    def _scoped_query(self, query: Query[Any], table_name: str, mirror_id: str) -> Query[Any]:
        model = self.TABLE_MODELS[table_name]
        if table_name == "mirrors":
            return query.filter(model.id == mirror_id)
        return query.filter(model.mirror_id == mirror_id)


d1_sync_service = D1SyncService()


def _is_sqlite_readonly_error(exc: Exception) -> bool:
    return _classify_sqlite_operational_error(exc) == "readonly"


def _classify_sqlite_operational_error(exc: Exception) -> str:
    chain = [str(exc).lower()]
    orig = getattr(exc, "orig", None)
    if orig is not None:
        chain.append(str(orig).lower())
    cause = getattr(exc, "__cause__", None)
    if cause is not None:
        chain.append(str(cause).lower())
    msg = " | ".join(chain)
    if "no such table" in msg:
        return "missing_table"
    if "readonly" in msg:
        return "readonly"
    return "other"


def _sqlite_local_db_is_readonly() -> bool:
    db_url = config.get_sqlalchemy_database_url()
    if not db_url.startswith("sqlite"):
        return False
    db_path = config.get_db_path()
    if db_path.exists():
        return not os.access(db_path, os.W_OK)
    parent = db_path.parent
    return not os.access(parent, os.W_OK)
