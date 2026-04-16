import asyncio
from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from backend import config
from backend.database.models import PersonImage
from backend.database.session import get_db
from backend.schemas.person_image import PersonImageRead, PersonImageUpdate
from backend.schemas.tryon_outfit import OutfitGenerateRequest, OutfitGenerateResponse
from backend.services import (
    leonardo_service,
    person_image_service,
    tryon_outfit_service,
    tryon_result_service,
)
from backend.services.realtime import control_registry

router = APIRouter(prefix="/tryon", tags=["tryon"])


@router.get("/person-image/latest")
def get_latest_person_image_file(db: Session = Depends(get_db)):
    record = person_image_service.get_latest_person_image(db)
    if record is None:
        raise HTTPException(status_code=404, detail="No person image available")
    path = person_image_service.resolve_safe_image_path(record)
    return FileResponse(path)


@router.get("/person-image/{image_id}")
def get_person_image_file_by_id(image_id: int, db: Session = Depends(get_db)):
    record = person_image_service.get_person_image_by_id(db, image_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Person image not found")
    path = person_image_service.resolve_safe_image_path(record)
    return FileResponse(path)


@router.get("/generated/{filename}", name="get_generated_tryon_image")
def get_generated_tryon_image(filename: str):
    path = tryon_result_service.resolve_generated_image_path(filename)
    return FileResponse(path)


@router.post("/person-image", response_model=PersonImageRead, status_code=201)
async def upload_person_image(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    return await person_image_service.save_person_image(db, file)


@router.get("/person-image", response_model=list[PersonImageRead])
def list_person_images(db: Session = Depends(get_db)):
    rows = db.query(PersonImage).order_by(PersonImage.created_at.desc(), PersonImage.id.desc()).all()
    return rows


@router.patch("/person-image/{image_id}", response_model=PersonImageRead)
def patch_person_image(
    image_id: int,
    payload: PersonImageUpdate,
    db: Session = Depends(get_db),
):
    row = person_image_service.get_person_image_by_id(db, image_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Person image not found")
    updates = payload.model_dump(exclude_unset=True)
    for k, v in updates.items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/person-image/{image_id}")
def delete_person_image(image_id: int, db: Session = Depends(get_db)):
    row = person_image_service.get_person_image_by_id(db, image_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Person image not found")
    path = person_image_service.resolve_safe_image_path(row)
    db.delete(row)
    db.commit()
    try:
        path.unlink(missing_ok=True)
    except OSError:
        pass
    return {"status": "ok", "deleted_id": image_id}


@router.post("/outfit-generate", response_model=OutfitGenerateResponse)
async def outfit_generate(
    payload: OutfitGenerateRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    if not config.LEONARDO_API_KEY.strip():
        raise HTTPException(status_code=503, detail="Leonardo API not configured (set LEONARDO_API_KEY)")
    try:
        gen_id, url = await asyncio.to_thread(
            tryon_outfit_service.run_outfit_generation,
            db,
            payload.clothing_image_ids,
            payload.prompt,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except leonardo_service.LeonardoError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    local_path = await asyncio.to_thread(tryon_result_service.store_remote_result, gen_id, url)
    await asyncio.to_thread(tryon_result_service.prune_generated_results)
    local_url = tryon_result_service.build_generated_image_url(request, local_path.name)

    await control_registry.broadcast(
        {
            "type": "TRYON_RESULT",
            "version": 2,
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "payload": {"generation_id": gen_id, "image_url": local_url},
        }
    )
    return OutfitGenerateResponse(status="complete", generation_id=gen_id, image_url=local_url)
