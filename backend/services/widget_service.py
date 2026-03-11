from typing import Any, Dict, List

from sqlalchemy.orm import Session

from backend.database.models import WidgetConfig
from backend.schemas.widget import WidgetConfigUpdate


DEFAULT_ZONE_MAP = {
    "clock": "hero",
    "weather": "right-top",
    "calendar": "right-stack",
}

LEGACY_SLOT_MAP = {
    "hero-left": "hero",
    "top-right": "right-top",
    "right-rail": "right-stack",
}
ZONE_TO_LEGACY_SLOT = {value: key for key, value in LEGACY_SLOT_MAP.items()}

ZONE_DEFAULTS = {
    "hero": {"display_order": 10, "row_span": 2, "col_span": 2, "max_col_span": 2, "max_row_span": 4},
    "right-top": {"display_order": 20, "row_span": 1, "col_span": 2, "max_col_span": 2, "max_row_span": 3},
    "right-stack": {"display_order": 30, "row_span": 2, "col_span": 2, "max_col_span": 3, "max_row_span": 4},
    "ambient": {"display_order": 40, "row_span": 1, "col_span": 2, "max_col_span": 3, "max_row_span": 3},
    "edge": {"display_order": 90, "row_span": 1, "col_span": 1, "max_col_span": 4, "max_row_span": 2},
}
VALID_ZONES = set(ZONE_DEFAULTS)


def _legacy_zone_for(widget_id: str, config_json: Dict[str, Any] | None) -> str:
    slot = (config_json or {}).get("slot")
    if slot in LEGACY_SLOT_MAP:
        return LEGACY_SLOT_MAP[slot]
    return DEFAULT_ZONE_MAP.get(widget_id, "ambient")


def _clamp_span(value: Any, fallback: int, max_value: int) -> int:
    try:
        span = int(value)
    except (TypeError, ValueError):
        span = fallback
    return max(1, min(span, max_value))


def _normalize_widget_layout(widget: WidgetConfig) -> WidgetConfig:
    config_json = dict(widget.config_json or {})
    legacy_zone = _legacy_zone_for(widget.widget_id, config_json)
    zone = widget.zone
    if not zone or (zone == "ambient" and legacy_zone != "ambient"):
        zone = legacy_zone
    zone = zone if zone in VALID_ZONES else "ambient"
    defaults = ZONE_DEFAULTS[zone]

    widget.zone = zone
    if widget.display_order in (None, 100):
        widget.display_order = config_json.get("priority", defaults["display_order"])
    widget.row_span = _clamp_span(
        widget.row_span if widget.row_span not in (None, 1) or widget.size_rows <= 1 else widget.size_rows,
        defaults["row_span"],
        defaults["max_row_span"],
    )
    widget.col_span = _clamp_span(
        widget.col_span if widget.col_span not in (None, 1) or widget.size_cols <= 1 else widget.size_cols,
        defaults["col_span"],
        defaults["max_col_span"],
    )

    # Mirror legacy layout keys during the migration window so older clients keep working.
    config_json["slot"] = ZONE_TO_LEGACY_SLOT.get(zone, config_json.get("slot"))
    config_json["priority"] = widget.display_order
    widget.config_json = config_json or None
    return widget


def _apply_payload_layout(data: Dict[str, Any]) -> Dict[str, Any]:
    config_json = dict(data.get("config_json") or {})
    zone = data.get("zone") or _legacy_zone_for(data.get("widget_id", ""), config_json)
    zone = zone if zone in VALID_ZONES else "ambient"
    defaults = ZONE_DEFAULTS[zone]

    data["zone"] = zone
    data["display_order"] = data.get("display_order", config_json.get("priority", defaults["display_order"]))
    data["row_span"] = _clamp_span(
        data.get("row_span", data.get("size_rows")),
        defaults["row_span"],
        defaults["max_row_span"],
    )
    data["col_span"] = _clamp_span(
        data.get("col_span", data.get("size_cols")),
        defaults["col_span"],
        defaults["max_col_span"],
    )

    if data.get("size_rows") is None:
        data["size_rows"] = data["row_span"]
    if data.get("size_cols") is None:
        data["size_cols"] = data["col_span"]

    config_json["slot"] = ZONE_TO_LEGACY_SLOT.get(zone, config_json.get("slot"))
    config_json["priority"] = data["display_order"]
    data["config_json"] = config_json or None
    return data


def _ordered_widgets(db: Session):
    return db.query(WidgetConfig).order_by(
        WidgetConfig.zone,
        WidgetConfig.display_order,
        WidgetConfig.position_row,
        WidgetConfig.position_col,
        WidgetConfig.id,
    )


def _seed_default_widgets(db: Session) -> List[WidgetConfig]:
    """
    Insert a minimal default layout if no widgets exist yet.
    This ensures the UI is not blank on first run.
    """
    defaults = [
        WidgetConfig(
            widget_id="clock",
            enabled=True,
            position_row=1,
            position_col=1,
            size_rows=3,
            size_cols=5,
            zone="hero",
            display_order=10,
            row_span=2,
            col_span=2,
            config_json={"slot": "hero-left", "priority": 10},
        ),
        WidgetConfig(
            widget_id="weather",
            enabled=True,
            position_row=1,
            position_col=8,
            size_rows=2,
            size_cols=5,
            zone="right-top",
            display_order=20,
            row_span=1,
            col_span=2,
            config_json={"slot": "top-right", "priority": 20},
        ),
        WidgetConfig(
            widget_id="calendar",
            enabled=True,
            position_row=3,
            position_col=8,
            size_rows=3,
            size_cols=5,
            zone="right-stack",
            display_order=30,
            row_span=2,
            col_span=2,
            config_json={"slot": "right-rail", "priority": 30, "maxEvents": 3},
        ),
    ]
    db.add_all(defaults)
    db.commit()
    return _ordered_widgets(db).all()


def get_all_widgets(db: Session) -> List[WidgetConfig]:
    """
    Return all widget configurations ordered for deterministic layout.
    Seed with a default layout if DB is empty.
    """
    widgets = _ordered_widgets(db).all()
    if not widgets:
        widgets = _seed_default_widgets(db)
    dirty = False
    for widget in widgets:
        before = (
            widget.zone,
            widget.display_order,
            widget.row_span,
            widget.col_span,
            dict(widget.config_json or {}),
        )
        _normalize_widget_layout(widget)
        after = (
            widget.zone,
            widget.display_order,
            widget.row_span,
            widget.col_span,
            dict(widget.config_json or {}),
        )
        if before != after:
            dirty = True
    if dirty:
        db.commit()
        widgets = _ordered_widgets(db).all()
    return widgets


def replace_widgets(db: Session, configs: List[WidgetConfigUpdate]) -> List[WidgetConfig]:
    """
    Replace widget configurations from client payload.
    Upserts incoming configs and deletes any rows not present in the list.
    """
    existing_by_id = {w.id: w for w in db.query(WidgetConfig).all()}
    seen_ids = set()

    for cfg in configs:
        data = _apply_payload_layout(cfg.model_dump(exclude_unset=True))
        wid = data.pop("id", None)

        if wid is not None and wid in existing_by_id:
            obj = existing_by_id[wid]
            for field, value in data.items():
                setattr(obj, field, value)
            _normalize_widget_layout(obj)
            seen_ids.add(obj.id)
        else:
            obj = WidgetConfig(**data)
            _normalize_widget_layout(obj)
            db.add(obj)
            db.flush()
            seen_ids.add(obj.id)

    # Delete rows not present in the incoming list (true PUT/replace semantics).
    for obj in existing_by_id.values():
        if obj.id not in seen_ids:
            db.delete(obj)

    db.commit()
    return get_all_widgets(db)

