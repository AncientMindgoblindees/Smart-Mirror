from typing import List

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, Response, UploadFile, status
from sqlalchemy.orm import Session

from backend.database.session import get_db
from backend.schemas.clothing import ClothingImageRead, ClothingItemCreate, ClothingItemRead, ClothingItemUpdate
from backend.services import clothing_service, user_service

router = APIRouter(prefix="/clothing", tags=["clothing"])


@router.get("/", response_model=List[ClothingItemRead])
def list_clothing(
    request: Request,
    db: Session = Depends(get_db),
    include_images: bool = Query(False, description="Include image rows per item"),
):
    _, profile = user_service.resolve_active_profile_context(db, request, require_token=False)
    items = clothing_service.list_clothing_items(db, profile.user_id, include_images=include_images)
    out: List[ClothingItemRead] = []
    for item in items:
        images = [ClothingImageRead.model_validate(img) for img in item.images] if include_images else None
        out.append(
            ClothingItemRead(
                id=item.id,
                name=item.name,
                category=item.category,
                color=item.color,
                season=item.season,
                notes=item.notes,
                created_at=item.created_at,
                updated_at=item.updated_at,
                images=images,
            )
        )
    return out


@router.post("/", response_model=ClothingItemRead, status_code=201)
def create_clothing_item(payload: ClothingItemCreate, request: Request, db: Session = Depends(get_db)):
    _, profile = user_service.resolve_active_profile_context(db, request, require_token=False)
    return clothing_service.create_clothing_item(db, profile.user_id, payload)


@router.get("/{item_id}", response_model=ClothingItemRead)
def get_clothing_item(
    item_id: int,
    request: Request,
    db: Session = Depends(get_db),
    include_images: bool = Query(False),
):
    _, profile = user_service.resolve_active_profile_context(db, request, require_token=False)
    item = clothing_service.get_clothing_item_by_id(db, profile.user_id, item_id, include_images=include_images)
    if item is None:
        raise HTTPException(status_code=404, detail="Clothing item not found")
    images = [ClothingImageRead.model_validate(img) for img in item.images] if include_images else None
    return ClothingItemRead(
        id=item.id,
        name=item.name,
        category=item.category,
        color=item.color,
        season=item.season,
        notes=item.notes,
        created_at=item.created_at,
        updated_at=item.updated_at,
        images=images,
    )


@router.put("/{item_id}", response_model=ClothingItemRead)
def update_clothing_item(item_id: int, payload: ClothingItemUpdate, request: Request, db: Session = Depends(get_db)):
    _, profile = user_service.resolve_active_profile_context(db, request, require_token=False)
    item = clothing_service.get_clothing_item_by_id(db, profile.user_id, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Clothing item not found")
    return clothing_service.update_clothing_item(db, item, payload)


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_clothing_item(item_id: int, request: Request, db: Session = Depends(get_db)):
    _, profile = user_service.resolve_active_profile_context(db, request, require_token=False)
    item = clothing_service.get_clothing_item_by_id(db, profile.user_id, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Clothing item not found")
    clothing_service.delete_clothing_item(db, item)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{item_id}/images", response_model=List[ClothingImageRead])
def list_clothing_images(item_id: int, request: Request, db: Session = Depends(get_db)):
    _, profile = user_service.resolve_active_profile_context(db, request, require_token=False)
    item = clothing_service.get_clothing_item_by_id(db, profile.user_id, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Clothing item not found")
    return clothing_service.list_clothing_images(db, profile.user_id, item_id)


@router.post("/{item_id}/images", response_model=ClothingImageRead, status_code=201)
async def upload_clothing_image(item_id: int, request: Request, file: UploadFile = File(...), db: Session = Depends(get_db)):
    _, profile = user_service.resolve_active_profile_context(db, request, require_token=False)
    item = clothing_service.get_clothing_item_by_id(db, profile.user_id, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Clothing item not found")
    return await clothing_service.upload_clothing_image_file(db, item, file)


@router.delete("/{item_id}/images/{image_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_clothing_image(item_id: int, image_id: int, request: Request, db: Session = Depends(get_db)):
    _, profile = user_service.resolve_active_profile_context(db, request, require_token=False)
    item = clothing_service.get_clothing_item_by_id(db, profile.user_id, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Clothing item not found")
    image = clothing_service.get_clothing_image_by_id(db, profile.user_id, item_id, image_id)
    if image is None:
        raise HTTPException(status_code=404, detail="Clothing image not found")
    clothing_service.delete_clothing_image(db, image)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
