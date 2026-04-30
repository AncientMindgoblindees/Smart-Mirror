import os
import traceback
import uuid
from pathlib import Path

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


async def generate_tryon(db: Session, payload: TryOnRequest) -> TryOnGeneration:
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

    generated_temp_path = None

    try:
        person_url = await leonardo_service.upload_init_image(person_image.file_path)

        pants_url = await _resolve_slot_image_url(
            provided_image=pants_image,
            default_file=DEFAULT_PANTS_IMAGE,
            label="pants",
        )
        shirt_url = await _resolve_slot_image_url(
            provided_image=shirt_image,
            default_file=DEFAULT_SHIRT_IMAGE,
            label="shirt",
        )
        shoes_url = await _resolve_slot_image_url(
            provided_image=shoes_image,
            default_file=DEFAULT_SHOES_IMAGE,
            label="shoes",
        )
        hat_url = await _resolve_slot_image_url(
            provided_image=hat_image,
            default_file=DEFAULT_HAT_IMAGE,
            label="hat",
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

        output_url = await leonardo_service.get_generated_image_url(
            leonardo_generation_id
        )
        generated_temp_path = await leonardo_service.download_image(output_url)

        upload_result = cloud_storage_service.upload_generated_image(
            generated_temp_path,
            public_id=f"tryon-{generation.id}-{uuid.uuid4()}",
        )

        generation.status = "completed"
        generation.result_storage_provider = upload_result["storage_provider"]
        generation.result_storage_key = upload_result["storage_key"]
        generation.result_image_url = upload_result["image_url"]
        generation.error_message = None

        db.commit()
        db.refresh(generation)
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

    finally:
        if generated_temp_path and os.path.exists(generated_temp_path):
            os.remove(generated_temp_path)


async def _resolve_slot_image_url(
    provided_image: ClothingImage | None,
    default_file: Path,
    label: str,
) -> str:
    if provided_image is not None:
        return await leonardo_service.upload_remote_image(provided_image.image_url)

    if not default_file.exists():
        raise HTTPException(
            status_code=500,
            detail=f"Missing default {label} placeholder image: {default_file}",
        )

    return await leonardo_service.upload_init_image(str(default_file))


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
