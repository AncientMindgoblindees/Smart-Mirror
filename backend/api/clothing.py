from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.database.session import get_db
from backend.schemas.clothing import (
    ClothingImageCreate,
    ClothingImageRead,
    ClothingItemCreate,
    ClothingItemRead,
)
from backend.services import clothing_service

router = APIRouter(prefix="/clothing", tags=["clothing"])


@router.get("/", response_model=List[ClothingItemRead])
def list_clothing(db: Session = Depends(get_db)):
    return clothing_service.list_clothing_items(db)


@router.post("/", response_model=ClothingItemRead, status_code=201)
def create_clothing_item(
    payload: ClothingItemCreate,
    db: Session = Depends(get_db),
):
    return clothing_service.create_clothing_item(db, payload)


@router.get("/{item_id}", response_model=ClothingItemRead)
def get_clothing_item(item_id: int, db: Session = Depends(get_db)):
    item = clothing_service.get_clothing_item_by_id(db, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Clothing item not found")
    return item


@router.get("/{item_id}/images", response_model=List[ClothingImageRead])
def list_clothing_images(item_id: int, db: Session = Depends(get_db)):
    item = clothing_service.get_clothing_item_by_id(db, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Clothing item not found")
    return clothing_service.list_clothing_images(db, item_id)


@router.post("/{item_id}/images", response_model=ClothingImageRead, status_code=201)
def create_clothing_image(
    item_id: int,
    payload: ClothingImageCreate,
    db: Session = Depends(get_db),
):
    item = clothing_service.get_clothing_item_by_id(db, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Clothing item not found")
    return clothing_service.create_clothing_image(db, item_id, payload)