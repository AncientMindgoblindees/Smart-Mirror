from __future__ import annotations

from typing import List

from sqlalchemy.orm import Session

from backend.database.models import ClothingImage, ClothingItem
from backend.services import leonardo_service, person_image_service


def resolve_clothing_image_urls(db: Session, user_id: str, clothing_image_ids: List[int]) -> List[str]:
    rows = (
        db.query(ClothingImage)
        .join(ClothingItem, ClothingItem.id == ClothingImage.clothing_item_id)
        .filter(ClothingImage.id.in_(clothing_image_ids))
        .filter(ClothingItem.user_id == user_id)
        .all()
    )
    if len(rows) != len(set(clothing_image_ids)):
        missing = set(clothing_image_ids) - {r.id for r in rows}
        raise ValueError(f"Unknown clothing_image id(s): {sorted(missing)}")
    order = {cid: i for i, cid in enumerate(clothing_image_ids)}
    rows.sort(key=lambda r: order[r.id])
    return [r.image_url for r in rows]


def run_outfit_generation(db: Session, user_id: str, clothing_image_ids: List[int], extra_prompt: str | None) -> tuple[str, str]:
    person = person_image_service.get_latest_person_image(db)
    if person is None:
        raise ValueError("No person image on the mirror yet. Upload via POST /api/tryon/person-image or capture on the Pi.")
    person_path = person_image_service.resolve_safe_image_path(person)
    garment_urls = resolve_clothing_image_urls(db, user_id, clothing_image_ids)
    return leonardo_service.run_virtual_try_on(person_path, garment_urls, extra_prompt=extra_prompt)
