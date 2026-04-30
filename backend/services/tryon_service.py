import os
import traceback
import uuid
import asyncio
import shutil
from pathlib import Path
from urllib.parse import urlparse

from fastapi import HTTPException
from sqlalchemy.orm import Session

from backend.database.models import ClothingImage, PersonImage, TryOnGeneration
from backend.schemas.tryon import TryOnRequest
from backend.services import cloud_storage_service, leonardo_service


BASE_DIR = Path(__file__).resolve().parents[2]
TRYON_DEFAULTS_DIR = BASE_DIR / "backend" / "assets" / "tryon_defaults"

DEFAULT_PANTS_IMAGE = TRYON_DEFAULTS_DIR / "pants_blank.jpg"
DEFAULT_SHIRT_IMAGE = TRYON_DEFAULTS_DIR / "shirt_blank.jpg"
DEFAULT_SHOES_IMAGE = TRYON_DEFAULTS_DIR / "shoes_blank.jpg"
DEFAULT_HAT_IMAGE = TRYON_DEFAULTS_DIR / "hat_blank.jpg"
MAX_STORED_GENERATIONS = 10
TRYON_OUTPUT_DIR = BASE_DIR / "data" / "tryon"
WARDROBE_RUNTIME_CACHE_DIR = BASE_DIR / "data" / "wardrobe_runtime_cache"

_DEFAULT_IMAGE_CACHE: dict[str, str] = {}
_RUNTIME_CLOTHING_FILE_CACHE: dict[int, str] = {}
_LAST_CACHE_RESULT: dict[str, list[int]] = {
    "cache_hit_image_ids": [],
    "cloudinary_fetch_image_ids": [],
    "cache_failed_image_ids": [],
}

TRYON_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
WARDROBE_RUNTIME_CACHE_DIR.mkdir(parents=True, exist_ok=True)


def _clear_runtime_wardrobe_cache() -> None:
    for child in WARDROBE_RUNTIME_CACHE_DIR.glob("*"):
        if child.is_file():
            child.unlink(missing_ok=True)


_clear_runtime_wardrobe_cache()
_RUNTIME_CLOTHING_FILE_CACHE.clear()


def create_generation(db: Session, payload: TryOnRequest) -> TryOnGeneration:
    person_image = (
        db.query(PersonImage)
        .filter(PersonImage.id == payload.person_image_id)
        .first()
    )
    if person_image is None:
        raise HTTPException(status_code=404, detail="Person image not found")

    if not os.path.exists(person_image.file_path):
        raise HTTPException(
            status_code=404,
            detail="Person image file not found on disk",
        )

    pants_image = _get_clothing_image_if_present(db, payload.pants_image_id, "Pants")
    shirt_image = _get_clothing_image_if_present(db, payload.shirt_image_id, "Shirt")
    shoes_image = _get_clothing_image_if_present(db, payload.shoes_image_id, "Shoes")
    hat_image = _get_clothing_image_if_present(db, payload.hat_image_id, "Hat")

    generation = TryOnGeneration(
        person_image_id=payload.person_image_id,
        pants_image_id=payload.pants_image_id,
        shirt_image_id=payload.shirt_image_id,
        shoes_image_id=payload.shoes_image_id,
        hat_image_id=payload.hat_image_id,
        status="processing",
    )
    db.add(generation)
    db.commit()
    db.refresh(generation)
    return generation


async def process_generation(db: Session, generation_id: int) -> TryOnGeneration:
    generation = (
        db.query(TryOnGeneration)
        .filter(TryOnGeneration.id == generation_id)
        .first()
    )
    if generation is None:
        raise HTTPException(status_code=404, detail="Generation not found")

    try:
        person_image = (
            db.query(PersonImage)
            .filter(PersonImage.id == generation.person_image_id)
            .first()
        )
        if person_image is None:
            raise HTTPException(status_code=404, detail="Person image not found")

        if not os.path.exists(person_image.file_path):
            raise HTTPException(
                status_code=404,
                detail="Person image file not found on disk",
            )

        pants_image = _get_clothing_image_if_present(db, generation.pants_image_id, "Pants")
        shirt_image = _get_clothing_image_if_present(db, generation.shirt_image_id, "Shirt")
        shoes_image = _get_clothing_image_if_present(db, generation.shoes_image_id, "Shoes")
        hat_image = _get_clothing_image_if_present(db, generation.hat_image_id, "Hat")

        person_url = await leonardo_service.upload_init_image(person_image.file_path)

        pants_url, shirt_url, shoes_url, hat_url = await asyncio.gather(
            _resolve_slot_image_url(db, provided_image=pants_image, default_file=DEFAULT_PANTS_IMAGE, label="pants"),
            _resolve_slot_image_url(db, provided_image=shirt_image, default_file=DEFAULT_SHIRT_IMAGE, label="shirt"),
            _resolve_slot_image_url(db, provided_image=shoes_image, default_file=DEFAULT_SHOES_IMAGE, label="shoes"),
            _resolve_slot_image_url(db, provided_image=hat_image, default_file=DEFAULT_HAT_IMAGE, label="hat"),
        )

        node_inputs = [
            {
                "value": person_url,
                "nodeId": leonardo_service.PERSON_NODE_ID,
                "settingName": "imageUrl",
            },
            {
                "value": pants_url,
                "nodeId": leonardo_service.PANTS_NODE_ID,
                "settingName": "imageUrl",
            },
            {
                "value": shirt_url,
                "nodeId": leonardo_service.SHIRT_NODE_ID,
                "settingName": "imageUrl",
            },
            {
                "value": shoes_url,
                "nodeId": leonardo_service.SHOES_NODE_ID,
                "settingName": "imageUrl",
            },
            {
                "value": hat_url,
                "nodeId": leonardo_service.HAT_NODE_ID,
                "settingName": "imageUrl",
            },
        ]

        execution_id = await leonardo_service.execute_blueprint(node_inputs)
        generation.leonardo_execution_id = execution_id
        db.commit()
        db.refresh(generation)

        leonardo_generation_id = await leonardo_service.wait_for_generation_id(
            execution_id
        )
        generation.leonardo_generation_id = leonardo_generation_id
        db.commit()
        db.refresh(generation)

        output_url = await leonardo_service.get_generated_image_url(leonardo_generation_id)
        local_result_path = await _persist_generated_image_local(output_url, generation.id)

        upload_result = cloud_storage_service.upload_generated_image(
            output_url,
            public_id=f"tryon-{generation.id}-{uuid.uuid4()}",
        )

        generation.status = "completed"
        generation.result_storage_provider = upload_result["storage_provider"]
        generation.result_storage_key = upload_result["storage_key"]
        generation.result_image_url = f"/api/tryon/public/generations/{generation.id}/image"
        generation.error_message = None

        db.commit()
        db.refresh(generation)
        _enforce_generation_retention(db, keep_latest=MAX_STORED_GENERATIONS)
        return generation

    except HTTPException as exc:
        traceback.print_exc()
        generation.status = "failed"
        generation.error_message = str(exc.detail)
        db.commit()
        db.refresh(generation)
        raise

    except Exception as exc:
        traceback.print_exc()
        generation.status = "failed"
        generation.error_message = str(exc)
        db.commit()
        db.refresh(generation)
        raise HTTPException(
            status_code=500,
            detail=f"Try-on generation failed: {exc}",
        )


async def _resolve_slot_image_url(
    db: Session,
    provided_image: ClothingImage | None,
    default_file: Path,
    label: str,
) -> str:
    if provided_image is not None:
        runtime_cached_file = _RUNTIME_CLOTHING_FILE_CACHE.get(provided_image.id)
        if runtime_cached_file and os.path.exists(runtime_cached_file):
            return await leonardo_service.upload_init_image(runtime_cached_file)
        if provided_image.leonardo_init_url:
            return provided_image.leonardo_init_url
        leonardo_url = await leonardo_service.upload_remote_image(provided_image.image_url)
        provided_image.leonardo_init_url = leonardo_url
        db.commit()
        return leonardo_url

    if not default_file.exists():
        raise HTTPException(
            status_code=500,
            detail=f"Missing default {label} placeholder image: {default_file}",
        )

    cache_key = str(default_file)
    cached = _DEFAULT_IMAGE_CACHE.get(cache_key)
    if cached:
        return cached
    leonardo_url = await leonardo_service.upload_init_image(str(default_file))
    _DEFAULT_IMAGE_CACHE[cache_key] = leonardo_url
    return leonardo_url


def _get_clothing_image_if_present(
    db: Session,
    image_id: int | None,
    label: str,
) -> ClothingImage | None:
    if image_id is None:
        return None

    image = db.query(ClothingImage).filter(ClothingImage.id == image_id).first()
    if image is None:
        raise HTTPException(status_code=404, detail=f"{label} image not found")
    return image


def get_generation_by_id(db: Session, generation_id: int) -> TryOnGeneration | None:
    return (
        db.query(TryOnGeneration)
        .filter(TryOnGeneration.id == generation_id)
        .first()
    )


def get_generation_local_image_path(generation_id: int) -> Path:
    base = TRYON_OUTPUT_DIR.resolve()
    pattern = f"generation-{generation_id}-*"
    files = sorted(TRYON_OUTPUT_DIR.glob(pattern), key=lambda p: p.stat().st_mtime, reverse=True)
    if not files:
        raise HTTPException(status_code=404, detail="Generated image not found on disk")
    image_path = files[0].resolve()
    try:
        image_path.relative_to(base)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid generated image path") from exc
    return image_path


async def cache_clothing_images(db: Session, image_ids: list[int]) -> dict[str, list[int]]:
    cached: list[int] = []
    hits: list[int] = []
    fetched: list[int] = []
    failed: list[int] = []
    seen: set[int] = set()
    for image_id in image_ids:
        if image_id in seen:
            continue
        seen.add(image_id)
        row = db.query(ClothingImage).filter(ClothingImage.id == image_id).first()
        if row is None:
            continue
        cached_path = _RUNTIME_CLOTHING_FILE_CACHE.get(row.id)
        if cached_path and os.path.exists(cached_path):
            cached.append(row.id)
            hits.append(row.id)
            continue
        try:
            local_path = await _download_clothing_to_runtime_cache(row.id, row.image_url)
            _RUNTIME_CLOTHING_FILE_CACHE[row.id] = str(local_path)
            cached.append(row.id)
            fetched.append(row.id)
        except Exception:
            failed.append(row.id)
    result = {
        "cached_image_ids": cached,
        "cache_hit_image_ids": hits,
        "cloudinary_fetch_image_ids": fetched,
        "cache_failed_image_ids": failed,
    }
    _LAST_CACHE_RESULT["cache_hit_image_ids"] = list(hits)
    _LAST_CACHE_RESULT["cloudinary_fetch_image_ids"] = list(fetched)
    _LAST_CACHE_RESULT["cache_failed_image_ids"] = list(failed)
    return result


def get_cache_status() -> dict[str, object]:
    valid_cache_ids = sorted(
        [
            image_id
            for image_id, file_path in _RUNTIME_CLOTHING_FILE_CACHE.items()
            if os.path.exists(file_path)
        ]
    )
    return {
        "cached_count": len(valid_cache_ids),
        "cached_image_ids": valid_cache_ids,
        "last_cache_hit_count": len(_LAST_CACHE_RESULT["cache_hit_image_ids"]),
        "last_cloudinary_fetch_count": len(_LAST_CACHE_RESULT["cloudinary_fetch_image_ids"]),
        "last_cache_failed_count": len(_LAST_CACHE_RESULT["cache_failed_image_ids"]),
        "last_cache_hit_image_ids": list(_LAST_CACHE_RESULT["cache_hit_image_ids"]),
        "last_cloudinary_fetch_image_ids": list(_LAST_CACHE_RESULT["cloudinary_fetch_image_ids"]),
        "last_cache_failed_image_ids": list(_LAST_CACHE_RESULT["cache_failed_image_ids"]),
    }


async def _download_clothing_to_runtime_cache(image_id: int, image_url: str) -> Path:
    temp_path = await leonardo_service.download_remote_image_to_tempfile(image_url)
    temp_suffix = Path(temp_path).suffix or ".jpg"
    target_path = WARDROBE_RUNTIME_CACHE_DIR / f"clothing-{image_id}{temp_suffix}"
    target_path.unlink(missing_ok=True)
    os.replace(temp_path, target_path)
    return target_path


async def _persist_generated_image_local(image_url: str, generation_id: int) -> Path:
    suffix = Path(urlparse(image_url).path).suffix or ".png"
    temp_path = await leonardo_service.download_image(image_url)
    target_path = TRYON_OUTPUT_DIR / f"generation-{generation_id}-{uuid.uuid4()}{suffix}"
    shutil.move(temp_path, target_path)
    return target_path


def _enforce_generation_retention(db: Session, keep_latest: int) -> None:
    completed = (
        db.query(TryOnGeneration)
        .filter(
            TryOnGeneration.status == "completed",
            TryOnGeneration.result_storage_provider == "cloudinary",
            TryOnGeneration.result_storage_key.is_not(None),
        )
        .order_by(TryOnGeneration.created_at.desc(), TryOnGeneration.id.desc())
        .all()
    )
    stale = completed[keep_latest:]
    for row in stale:
        try:
            local_path = get_generation_local_image_path(row.id)
            local_path.unlink(missing_ok=True)
        except HTTPException:
            pass
        if row.result_storage_key:
            try:
                cloud_storage_service.delete_image(row.result_storage_key)
            except Exception:
                traceback.print_exc()
        db.delete(row)
    if stale:
        db.commit()
