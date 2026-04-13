import asyncio
from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from backend import config
from backend.database.session import get_db
from backend.schemas.person_image import PersonImageRead
from backend.schemas.tryon_outfit import OutfitGenerateRequest, OutfitGenerateResponse
from backend.services import leonardo_service, person_image_service, tryon_outfit_service
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


@router.post("/person-image", response_model=PersonImageRead, status_code=201)
async def upload_person_image(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    return await person_image_service.save_person_image(db, file)


@router.post("/outfit-generate", response_model=OutfitGenerateResponse)
async def outfit_generate(
    payload: OutfitGenerateRequest,
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

    await control_registry.broadcast(
        {
            "type": "TRYON_RESULT",
            "version": 2,
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "payload": {"generation_id": gen_id, "image_url": url},
        }
    )
    return OutfitGenerateResponse(status="complete", generation_id=gen_id, image_url=url)
