from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.database.models import ClothingItem
from backend.database.session import get_db
from backend.schemas.clothing import ClothingItemCreate, ClothingItemRead

router = APIRouter(prefix="/clothing", tags=["clothing"])


@router.get("/", response_model=List[ClothingItemRead])
def list_clothing(db: Session = Depends(get_db)):
    items = db.query(ClothingItem).all()
    return items


@router.post("/", response_model=ClothingItemRead, status_code=201)
def create_clothing_item(
    payload: ClothingItemCreate,
    db: Session = Depends(get_db),
):
    item = ClothingItem(
        name=payload.name,
        category=payload.category,
        color=payload.color,
        season=payload.season,
        notes=payload.notes,
    )

    db.add(item)
    db.commit()
    db.refresh(item)

    return item


@router.get("/{item_id}", response_model=ClothingItemRead)
def get_clothing_item(item_id: int, db: Session = Depends(get_db)):
    item = db.query(ClothingItem).filter(ClothingItem.id == item_id).first()

    if item is None:
        raise HTTPException(status_code=404, detail="Clothing item not found")

    return item