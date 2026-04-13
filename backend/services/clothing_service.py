import os
import tempfile
import uuid
from typing import List, Optional

from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session, joinedload

from backend.database.models import ClothingImage, ClothingItem
from backend.schemas.clothing import ClothingItemCreate, ClothingItemUpdate
from backend.services import cloud_storage_service


ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


def list_clothing_items(db: Session, include_images: bool = False) -> List[ClothingItem]:
    q = db.query(ClothingItem)
    if include_images:
        q = q.options(joinedload(ClothingItem.images))
    return q.order_by(ClothingItem.updated_at.desc()).all()


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


def get_clothing_item_by_id(
    db: Session, item_id: int, include_images: bool = False
) -> Optional[ClothingItem]:
    q = db.query(ClothingItem).filter(ClothingItem.id == item_id)
    if include_images:
        q = q.options(joinedload(ClothingItem.images))
    return q.first()


def update_clothing_item(
    db: Session,
    item: ClothingItem,
    payload: ClothingItemUpdate,
) -> ClothingItem:
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, field, value)

    db.commit()
    db.refresh(item)
    return item


def delete_clothing_item(db: Session, item: ClothingItem) -> None:
    db.delete(item)
    db.commit()


def list_clothing_images(db: Session, item_id: int) -> List[ClothingImage]:
    return (
        db.query(ClothingImage)
        .filter(ClothingImage.clothing_item_id == item_id)
        .all()
    )


def get_clothing_image_by_id(
    db: Session,
    item_id: int,
    image_id: int,
) -> Optional[ClothingImage]:
    return (
        db.query(ClothingImage)
        .filter(
            ClothingImage.id == image_id,
            ClothingImage.clothing_item_id == item_id,
        )
        .first()
    )


def delete_clothing_image(db: Session, image: ClothingImage) -> None:
    db.delete(image)
    db.commit()


async def upload_clothing_image_file(
    db: Session,
    item: ClothingItem,
    file: UploadFile,
) -> ClothingImage:
    """
    Accept an uploaded image file, send it to Cloudinary, then store the
    returned metadata in the local SQLite database.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing filename")

    suffix = os.path.splitext(file.filename)[1].lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type. Use jpg, jpeg, png, or webp.",
        )

    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
            temp_file.write(contents)
            temp_path = temp_file.name

        upload_result = cloud_storage_service.upload_clothing_image(
            temp_path,
            public_id=f"{item.id}-{uuid.uuid4()}",
        )

        image = ClothingImage(
            clothing_item_id=item.id,
            storage_provider=upload_result["storage_provider"],
            storage_key=upload_result["storage_key"],
            image_url=upload_result["image_url"],
        )

        db.add(image)
        db.commit()
        db.refresh(image)
        return image

    finally:
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)