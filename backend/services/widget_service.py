from datetime import datetime
from typing import List, Optional

from sqlalchemy.orm import Session

from backend.database.models import WidgetConfig
from backend.schemas.mirror_sync_state import SyncStateInbound
from backend.schemas.widget import WidgetConfigUpdate
from backend.services import user_service


def _seed_default_widgets(db: Session, mirror_id: str, user_id: str) -> List[WidgetConfig]:
    defaults = [
        WidgetConfig(
            mirror_id=mirror_id,
            user_id=user_id,
            widget_id="clock",
            enabled=True,
            position_row=1,
            position_col=1,
            size_rows=1,
            size_cols=2,
            config_json={"freeform": {"x": 3, "y": 4, "width": 32, "height": 18}},
        ),
        WidgetConfig(
            mirror_id=mirror_id,
            user_id=user_id,
            widget_id="weather",
            enabled=True,
            position_row=1,
            position_col=3,
            size_rows=1,
            size_cols=1,
            config_json={"freeform": {"x": 67, "y": 4, "width": 30, "height": 18}},
        ),
        WidgetConfig(
            mirror_id=mirror_id,
            user_id=user_id,
            widget_id="news",
            enabled=True,
            position_row=3,
            position_col=1,
            size_rows=2,
            size_cols=2,
            config_json={
                "freeform": {"x": 3, "y": 70, "width": 45, "height": 24},
                "integration": {
                    "feature": "news",
                    "provider": "gemini",
                    "model": "gemini-3-flash",
                    "endpoint": "/api/integrations/news",
                },
            },
        ),
        WidgetConfig(
            mirror_id=mirror_id,
            user_id=user_id,
            widget_id="calendar",
            enabled=True,
            position_row=3,
            position_col=3,
            size_rows=2,
            size_cols=2,
            config_json={"freeform": {"x": 56, "y": 68, "width": 41, "height": 26}},
        ),
        WidgetConfig(
            mirror_id=mirror_id,
            user_id=user_id,
            widget_id="email",
            enabled=True,
            position_row=2,
            position_col=3,
            size_rows=1,
            size_cols=1,
            config_json={"freeform": {"x": 56, "y": 42, "width": 30, "height": 18}},
        ),
        WidgetConfig(
            mirror_id=mirror_id,
            user_id=user_id,
            widget_id="virtual_try_on",
            enabled=True,
            position_row=2,
            position_col=2,
            size_rows=1,
            size_cols=1,
            config_json={
                "freeform": {"x": 39, "y": 41, "width": 22, "height": 16},
                "integration": {
                    "feature": "virtual_try_on",
                    "endpoint": "/api/integrations/try-on",
                },
            },
        ),
    ]
    db.add_all(defaults)
    db.commit()
    return _list_widgets_query(db, mirror_id, user_id).all()


def _list_widgets_query(db: Session, mirror_id: str, user_id: str, *, include_deleted: bool = False):
    query = db.query(WidgetConfig).filter(WidgetConfig.mirror_id == mirror_id, WidgetConfig.user_id == user_id)
    if not include_deleted:
        query = query.filter(WidgetConfig.deleted_at.is_(None))
    return query.order_by(WidgetConfig.position_row, WidgetConfig.position_col, WidgetConfig.id)


def _widget_snapshot(widgets: List[WidgetConfig]) -> dict:
    return {
        "widgets": [
            {
                "id": row.id,
                "widget_id": row.widget_id,
                "enabled": row.enabled,
                "position_row": row.position_row,
                "position_col": row.position_col,
                "size_rows": row.size_rows,
                "size_cols": row.size_cols,
                "config_json": row.config_json or {},
            }
            for row in widgets
        ]
    }


def get_all_widgets(db: Session, mirror_id: str, user_id: str) -> List[WidgetConfig]:
    widgets = _list_widgets_query(db, mirror_id, user_id).all()
    if not widgets:
        widgets = _seed_default_widgets(db, mirror_id, user_id)
    return widgets


def replace_widgets(db: Session, mirror_id: str, user_id: str, configs: List[WidgetConfigUpdate]) -> List[WidgetConfig]:
    all_rows = list(_list_widgets_query(db, mirror_id, user_id, include_deleted=True).all())
    initial_rows = [row for row in all_rows if row.deleted_at is None]
    existing_by_id = {w.id: w for w in all_rows}
    existing_by_widget_id: dict[str, WidgetConfig] = {}
    for row in sorted(all_rows, key=lambda item: (item.deleted_at is not None, item.id)):
        existing_by_widget_id.setdefault(row.widget_id, row)

    seen_ids: set[int] = set()
    now = datetime.utcnow()
    for cfg in configs:
        data = cfg.model_dump(exclude_unset=True)
        row_id = data.pop("id", None)
        obj: Optional[WidgetConfig] = None
        if row_id is not None and row_id in existing_by_id:
            obj = existing_by_id[row_id]
        if obj is None:
            widget_id = data.get("widget_id")
            if isinstance(widget_id, str):
                obj = existing_by_widget_id.get(widget_id)
        if obj is None:
            obj = WidgetConfig(mirror_id=mirror_id, user_id=user_id, **data)
            db.add(obj)
            db.flush()
            existing_by_id[obj.id] = obj
            existing_by_widget_id[obj.widget_id] = obj
        else:
            obj.deleted_at = None
            for field, value in data.items():
                setattr(obj, field, value)
        seen_ids.add(obj.id)

    for row in initial_rows:
        if row.id not in seen_ids:
            row.deleted_at = now
            row.updated_at = now
    db.commit()

    widgets = get_all_widgets(db, mirror_id, user_id)
    user_service.update_profile_widget_snapshot(db, mirror_id, user_id, _widget_snapshot(widgets))
    return widgets


def updates_from_sync_state(
    db: Session,
    mirror_id: str,
    user_id: str,
    sync: SyncStateInbound,
) -> List[WidgetConfigUpdate]:
    existing_list = _list_widgets_query(db, mirror_id, user_id).all()
    existing_by_wid = {w.widget_id: w for w in existing_list}
    out: List[WidgetConfigUpdate] = []

    for item in sync.widgets:
        wid = (item.widget_id or item.id or "").strip()
        if not wid:
            continue
        ex = existing_by_wid.get(wid)
        cfg_payload: dict = {}
        if isinstance(item.config, dict):
            cfg_payload.update(item.config)
        cfg_payload["freeform"] = {
            "x": float(item.x) if item.x is not None else 10.0,
            "y": float(item.y) if item.y is not None else 10.0,
            "width": float(item.width) if item.width is not None else 30.0,
            "height": float(item.height) if item.height is not None else 20.0,
        }
        out.append(
            WidgetConfigUpdate(
                id=ex.id if ex else None,
                widget_id=wid,
                enabled=ex.enabled if ex else True,
                position_row=ex.position_row if ex else 1,
                position_col=ex.position_col if ex else 1,
                size_rows=ex.size_rows if ex else 2,
                size_cols=ex.size_cols if ex else 2,
                config_json=cfg_payload,
            )
        )
    return out


def get_layout_revision(db: Session, mirror_id: str, user_id: str) -> str:
    rows = _list_widgets_query(db, mirror_id, user_id).with_entities(WidgetConfig.updated_at).all()
    count = len(rows)
    if not rows:
        return "0-0"
    latest: datetime = max(row[0] for row in rows if row[0] is not None)  # type: ignore[assignment]
    return f"{int(latest.timestamp())}-{count}"
