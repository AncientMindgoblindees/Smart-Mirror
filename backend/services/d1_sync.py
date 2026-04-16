from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple, Type
from urllib.parse import urlparse

import httpx
from sqlalchemy import func, or_
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
from backend.services.datetime_utils import parse_datetime_utc_naive, to_iso_utc_z
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
        self._remote_cursor_iso: Dict[str, str] = {table: PULL_FLOOR_ISO for table in self.TABLE_ORDER}
        self._remote_cursor_id: Dict[str, int] = {table: 0 for table in self.TABLE_ORDER}
        self._force_full_sync_pending = False

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
        widget_changed = False
        for table in self.TABLE_ORDER:
            await self.push(table)
            want_full = self._force_full_sync_pending or await self._detect_drift_full_pull(table)
            changed = await self.pull(table, full=want_full)
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

        try:
            body = response.json()
        except ValueError:
            body = {}
        accepted_ids_raw = body.get("accepted_ids") if isinstance(body, dict) else None
        if isinstance(accepted_ids_raw, list):
            accepted_ids = [int(v) for v in accepted_ids_raw if isinstance(v, (int, float, str)) and str(v).isdigit()]
        else:
            accepted_ids = [int(row["id"]) for row in payload_rows if row.get("id") is not None]

        now = datetime.utcnow()
        if not accepted_ids:
            return

        db = SessionLocal()
        try:
            rows = db.query(model).filter(model.id.in_(accepted_ids)).all()
            for row in rows:
                row.synced_at = now
            db.commit()
        finally:
            db.close()

    async def pull(self, table_name: str, *, full: bool = False) -> bool:
        since = self._remote_cursor_iso.get(table_name, PULL_FLOOR_ISO)
        since_id = self._remote_cursor_id.get(table_name, 0)
        params: Dict[str, str] = {"table": table_name, "since": since, "since_id": str(since_id)}
        if full:
            params["full"] = "1"
        response = await self._request(
            "GET",
            "/sync/pull",
            params=params,
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
            self._touch_last_pull_at(table_name)
            return False

        changed = self._merge_remote_rows(table_name, rows)
        max_cursor_iso, max_cursor_id = self._max_remote_cursor(table_name, rows)
        if max_cursor_iso is None:
            # Must advance cursor after a non-empty pull or incremental pulls repeat forever.
            max_cursor_iso = self._utc_now_iso_z()
            max_cursor_id = 0
            logger.warning(
                "D1 pull had rows but no parseable order column for %s; using wall-clock cursor fallback",
                table_name,
            )
        self._persist_remote_cursor(table_name, max_cursor_iso, max_cursor_id)
        self._touch_last_pull_at(table_name)
        return changed

    async def _detect_drift_full_pull(self, table_name: str) -> bool:
        stats = await self._fetch_table_stats(table_name)
        if stats is None:
            return False
        local = self._local_table_stats(table_name)
        if local is None:
            return False
        remote_count = int(stats.get("count", 0))
        local_count = local["count"]
        if remote_count > local_count:
            logger.info(
                "D1 drift: remote count %s > local %s for %s; full pull",
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

    async def _fetch_table_stats(self, table_name: str) -> Optional[Dict[str, Any]]:
        response = await self._request(
            "GET",
            "/sync/stats",
            params={"table": table_name},
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

    def _local_table_stats(self, table_name: str) -> Optional[Dict[str, Any]]:
        model = self.TABLE_MODELS[table_name]
        order_attr = self._order_column_attr(model, table_name)
        db = SessionLocal()
        try:
            count = int(db.query(func.count(model.id)).scalar() or 0)
            max_val = db.query(func.max(order_attr)).scalar()
            return {"count": count, "max_order": max_val}
        finally:
            db.close()

    @staticmethod
    def _order_column_attr(model: Type[Any], table_name: str) -> Any:
        if table_name == "clothing_image":
            return model.created_at
        return model.updated_at

    @classmethod
    def _local_order_ts_ms(cls, value: Any) -> float:
        if value is None:
            return float("-inf")
        dt = parse_datetime_utc_naive(value)
        if dt is None:
            return float("-inf")
        return float(dt.replace(tzinfo=timezone.utc).timestamp()) * 1000.0

    @staticmethod
    def _utc_now_iso_z() -> str:
        return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    @classmethod
    def _remote_order_ts_ms(cls, value: Any) -> float:
        if value is None:
            return float("-inf")
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            v = float(value)
            # Seconds since epoch vs milliseconds (D1 JSON is usually ISO strings).
            return v if v > 1e12 else v * 1000.0
        text = str(value).strip()
        if not text:
            return float("-inf")
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        elif " " in text and "T" not in text.split(" ", 1)[0]:
            # SQLite / D1 often returns "YYYY-MM-DD HH:MM:SS" (Python < 3.11 fromisoformat needs T).
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
        except OperationalError:
            db.rollback()
            logger.warning("D1 checkpoint table missing; skipping cursor reset persist")
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
        except OperationalError:
            db.rollback()
            logger.warning("D1 checkpoint table missing; skipping remote cursor persist")
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
        except OperationalError:
            db.rollback()
            logger.warning("D1 checkpoint table missing; skipping last_pull_at touch")
        finally:
            db.close()

    def _max_remote_cursor(self, table_name: str, rows: List[Dict[str, Any]]) -> Tuple[Optional[str], int]:
        best_iso: Optional[str] = None
        best_id = 0
        best_ms = float("-inf")
        for incoming in rows:
            row_id = incoming.get("id")
            if row_id is None:
                continue
            try:
                row_id_int = int(row_id)
            except (TypeError, ValueError):
                continue
            raw = self._order_value_raw_from_payload(table_name, incoming)
            if raw is None:
                continue
            ms = self._remote_order_ts_ms(raw)
            if ms > best_ms or (ms == best_ms and row_id_int > best_id):
                best_ms = ms
                best_iso = self._normalize_remote_cursor_iso(raw)
                best_id = row_id_int
        return best_iso, best_id

    @staticmethod
    def _order_value_raw_from_payload(table_name: str, incoming: Dict[str, Any]) -> Any:
        if table_name == "clothing_image":
            return incoming.get("created_at")
        return incoming.get("updated_at") or incoming.get("created_at")

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
        return parse_datetime_utc_naive(value)

    @staticmethod
    def _to_iso(value: Optional[datetime]) -> Optional[str]:
        return to_iso_utc_z(value)

    def _load_checkpoints(self) -> None:
        db = SessionLocal()
        try:
            rows = (
                db.query(D1SyncCheckpoint)
                .filter(D1SyncCheckpoint.table_name.in_(self.TABLE_ORDER))
                .all()
            )
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


d1_sync_service = D1SyncService()
