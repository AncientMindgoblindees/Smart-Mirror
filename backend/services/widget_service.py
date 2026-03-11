from typing import List

from sqlalchemy.orm import Session

from backend.database.models import WidgetConfig
from backend.schemas.widget import WidgetConfigUpdate


def get_all_widgets(db: Session) -> List[WidgetConfig]:
    """
    Return all widget configurations ordered for deterministic layout.
    """
    return (
        db.query(WidgetConfig)
        .order_by(WidgetConfig.position_row, WidgetConfig.position_col, WidgetConfig.id)
        .all()
    )


def upsert_widgets(db: Session, configs: List[WidgetConfigUpdate]) -> List[WidgetConfig]:
    """
    Bulk upsert widget configurations from client payload.
    """
    existing_by_id = {w.id: w for w in db.query(WidgetConfig).all()}
    seen_ids: set[int] = set()

    for cfg in configs:
        data = cfg.dict(exclude_unset=True)
        wid = data.pop("id", None)

        if wid is not None and wid in existing_by_id:
            obj = existing_by_id[wid]
            for field, value in data.items():
                setattr(obj, field, value)
            seen_ids.add(obj.id)
        else:
            obj = WidgetConfig(**data)
            db.add(obj)
            db.flush()
            seen_ids.add(obj.id)

    db.commit()
    return get_all_widgets(db)

