from datetime import datetime
from typing import List

from sqlalchemy.orm import Session

from backend.database.models import WidgetConfig
from backend.schemas.mirror_sync_state import SyncStateInbound
from backend.schemas.widget import WidgetConfigUpdate


def _seed_default_widgets(db: Session) -> List[WidgetConfig]:
    """
    Insert a mirror-first peripheral default layout if no widgets exist yet.
    This keeps center reflection clear and edge information visible on first run.
    """
    defaults = [
        WidgetConfig(
            widget_id="clock",
            enabled=True,
            position_row=1,
            position_col=1,
            size_rows=1,
            size_cols=2,
            config_json={"freeform": {"x": 3, "y": 4, "width": 32, "height": 18}},
        ),
        WidgetConfig(
            widget_id="weather",
            enabled=True,
            position_row=1,
            position_col=3,
            size_rows=1,
            size_cols=1,
            config_json={"freeform": {"x": 67, "y": 4, "width": 30, "height": 18}},
        ),
        WidgetConfig(
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
            widget_id="calendar",
            enabled=True,
            position_row=3,
            position_col=3,
            size_rows=2,
            size_cols=2,
            config_json={"freeform": {"x": 56, "y": 68, "width": 41, "height": 26}},
        ),
        WidgetConfig(
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
    return (
        db.query(WidgetConfig)
        .order_by(WidgetConfig.position_row, WidgetConfig.position_col, WidgetConfig.id)
        .all()
    )


def get_all_widgets(db: Session) -> List[WidgetConfig]:
    """
    Return all widget configurations ordered for deterministic layout.
    Seed with a default layout if DB is empty.
    """
    widgets = (
        db.query(WidgetConfig)
        .order_by(WidgetConfig.position_row, WidgetConfig.position_col, WidgetConfig.id)
        .all()
    )
    if not widgets:
        widgets = _seed_default_widgets(db)
    return widgets


def replace_widgets(db: Session, configs: List[WidgetConfigUpdate]) -> List[WidgetConfig]:
    """
    Replace widget configurations from client payload.
    Upserts incoming configs and deletes any rows not present in the list.
    """
    existing_by_id = {w.id: w for w in db.query(WidgetConfig).all()}
    seen_ids = set()

    for cfg in configs:
        data = cfg.model_dump(exclude_unset=True)
        wid = data.pop("id", None)

        if wid is not None and wid in existing_by_id:
            obj = existing_by_id[wid]
            for field, value in data.items():
                setattr(obj, field, value)
        else:
            obj = WidgetConfig(**data)
            db.add(obj)
            db.flush()
        seen_ids.add(obj.id)

    # Delete rows not present in the incoming list (true PUT/replace semantics).
    for obj in existing_by_id.values():
        if obj.id not in seen_ids:
            db.delete(obj)

    db.commit()
    return get_all_widgets(db)


def updates_from_sync_state(db: Session, sync: SyncStateInbound) -> List[WidgetConfigUpdate]:
    """
    Map config-app SYNC_STATE (percent layout) to WidgetConfigUpdate rows for replace_widgets.
    Preserves grid + enabled from existing rows when matched by widget_id.
    """
    existing_list = db.query(WidgetConfig).all()
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
        fx = float(item.x) if item.x is not None else 10.0
        fy = float(item.y) if item.y is not None else 10.0
        fw = float(item.width) if item.width is not None else 30.0
        fh = float(item.height) if item.height is not None else 20.0
        cfg_payload["freeform"] = {"x": fx, "y": fy, "width": fw, "height": fh}

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


def get_layout_revision(db: Session) -> str:
    """
    Lightweight revision token for optimistic UI merges.
    Uses max(updated_at) timestamp + row count.
    """
    rows = db.query(WidgetConfig.updated_at).all()
    count = len(rows)
    if not rows:
        return "0-0"
    latest: datetime = max(r[0] for r in rows if r[0] is not None)  # type: ignore[assignment]
    return f"{int(latest.timestamp())}-{count}"
