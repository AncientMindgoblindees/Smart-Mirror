from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.database.session import get_db
from backend.schemas.widget import WidgetConfigOut, WidgetConfigUpdate
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
    return widget_service.replace_widgets(db, payload)

