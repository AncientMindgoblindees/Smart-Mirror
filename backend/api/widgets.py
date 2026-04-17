from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.database.models import WidgetConfig
from backend.database.session import get_db
from backend.schemas.widget import WidgetConfigCreate, WidgetConfigOut, WidgetConfigPatch, WidgetConfigUpdate
from backend.services.debug_log import write_debug_log
from backend.services import widget_service


router = APIRouter(prefix="/widgets", tags=["widgets"])


@router.get(
    "/",
    response_model=List[WidgetConfigOut],
    summary="Get all widget configurations",
)
def get_widgets(db: Session = Depends(get_db)) -> List[WidgetConfigOut]:
    return widget_service.get_all_widgets(db)


@router.put(
    "/",
    response_model=List[WidgetConfigOut],
    summary="Replace or update widget layout",
)
def put_widgets(
    payload: List[WidgetConfigUpdate],
    db: Session = Depends(get_db),
) -> List[WidgetConfigOut]:
    # region agent log
    write_debug_log(
        run_id="baseline",
        hypothesis_id="H1",
        location="backend/api/widgets.py:34",
        message="put_widgets request received",
        data={"payload_count": len(payload)},
    )
    # endregion
    try:
        return widget_service.replace_widgets(db, payload)
    except Exception as exc:
        # region agent log
        write_debug_log(
            run_id="baseline",
            hypothesis_id="H1",
            location="backend/api/widgets.py:45",
            message="put_widgets failed",
            data={"error_type": type(exc).__name__, "error": str(exc)},
        )
        # endregion
        raise


@router.get(
    "/revision",
    summary="Get layout revision token",
)
def get_widget_layout_revision(db: Session = Depends(get_db)) -> dict:
    return {"revision": widget_service.get_layout_revision(db)}


@router.post("/item", response_model=WidgetConfigOut, status_code=201, summary="Create one widget row")
def create_widget_item(payload: WidgetConfigCreate, db: Session = Depends(get_db)) -> WidgetConfigOut:
    row = WidgetConfig(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.get("/item/{item_id}", response_model=WidgetConfigOut, summary="Get one widget row")
def get_widget_item(item_id: int, db: Session = Depends(get_db)) -> WidgetConfigOut:
    row = db.query(WidgetConfig).filter_by(id=item_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Widget row not found")
    return row


@router.patch("/item/{item_id}", response_model=WidgetConfigOut, summary="Patch one widget row")
def patch_widget_item(item_id: int, payload: WidgetConfigPatch, db: Session = Depends(get_db)) -> WidgetConfigOut:
    row = db.query(WidgetConfig).filter_by(id=item_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Widget row not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/item/{item_id}", summary="Delete one widget row")
def delete_widget_item(item_id: int, db: Session = Depends(get_db)) -> dict:
    row = db.query(WidgetConfig).filter_by(id=item_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Widget row not found")
    db.delete(row)
    db.commit()
    return {"status": "ok", "deleted_id": item_id}

