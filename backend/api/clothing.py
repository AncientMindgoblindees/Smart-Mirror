from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.database.models import ClothingImage, ClothingItem
from backend.database.session import get_db
from backend.schemas.clothing import (
    ClothingImageCreate,
    ClothingImageRead,
    ClothingItemCreate,
    ClothingItemRead,
)

router = APIRouter(prefix="/clothing", tags=["clothing"])


@router.get("/", response_model=List[ClothingItemRead])
def list_clothing(db: Session = Depends(get_db)):
    return db.query(ClothingItem).all()


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


@router.get("/{item_id}/images", response_model=List[ClothingImageRead])
def list_clothing_images(item_id: int, db: Session = Depends(get_db)):
    item = db.query(ClothingItem).filter(ClothingItem.id == item_id).first()
    if item is None:
        raise HTTPException(status_code=404, detail="Clothing item not found")

    return (
        db.query(ClothingImage)
        .filter(ClothingImage.clothing_item_id == item_id)
        .all()
    )


@router.post("/{item_id}/images", response_model=ClothingImageRead, status_code=201)
def create_clothing_image(
    item_id: int,
    payload: ClothingImageCreate,
    db: Session = Depends(get_db),
):
    item = db.query(ClothingItem).filter(ClothingItem.id == item_id).first()
    if item is None:
        raise HTTPException(status_code=404, detail="Clothing item not found")

    image = ClothingImage(
        clothing_item_id=item_id,
        storage_provider=payload.storage_provider,
        storage_key=payload.storage_key,
        image_url=payload.image_url,
    )

    db.add(image)
    db.commit()
    db.refresh(image)

    return image