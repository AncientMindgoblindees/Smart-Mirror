from typing import List

from sqlalchemy.orm import Session

from backend.database.models import ClothingImage, ClothingItem
from backend.schemas.clothing import ClothingImageCreate, ClothingItemCreate


def list_clothing_items(db: Session) -> List[ClothingItem]:
    return db.query(ClothingItem).all()


def create_clothing_item(db: Session, payload: ClothingItemCreate) -> ClothingItem:
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


def get_clothing_item_by_id(db: Session, item_id: int) -> ClothingItem | None:
    return db.query(ClothingItem).filter(ClothingItem.id == item_id).first()


def list_clothing_images(db: Session, item_id: int) -> List[ClothingImage]:
    return (
        db.query(ClothingImage)
        .filter(ClothingImage.clothing_item_id == item_id)
        .all()
    )


def create_clothing_image(
    db: Session,
    item_id: int,
    payload: ClothingImageCreate,
) -> ClothingImage:
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