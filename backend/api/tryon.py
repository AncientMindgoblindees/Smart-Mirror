from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from backend.database.models import PersonImage
from backend.database.session import get_db
from backend.schemas.person_image import PersonImageRead
from backend.schemas.tryon import TryOnGenerationRead, TryOnRequest
from backend.services import person_image_service, tryon_service

router = APIRouter(prefix="/tryon", tags=["tryon"])


@router.post("/person-image", response_model=PersonImageRead, status_code=201)
async def upload_person_image(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    return await person_image_service.save_person_image(db, file)


@router.get("/person-image", response_model=list[PersonImageRead])
def list_person_images(db: Session = Depends(get_db)):
    return (
        db.query(PersonImage)
        .order_by(PersonImage.created_at.desc(), PersonImage.id.desc())
        .all()
    )


@router.get("/person-image/latest")
def get_latest_person_image_file(db: Session = Depends(get_db)):
    record = person_image_service.get_latest_person_image(db)
    if record is None:
        raise HTTPException(status_code=404, detail="No person image available")
    path = person_image_service.resolve_safe_image_path(record)
    return FileResponse(
        path,
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0",
        },
    )


@router.get("/person-image/{image_id}")
def get_person_image_file_by_id(image_id: int, db: Session = Depends(get_db)):
    record = person_image_service.get_person_image_by_id(db, image_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Person image not found")
    path = person_image_service.resolve_safe_image_path(record)
    return FileResponse(path)


@router.post("/generate", response_model=TryOnGenerationRead, status_code=201)
async def generate_tryon(
    payload: TryOnRequest,
    db: Session = Depends(get_db),
):
    return await tryon_service.generate_tryon(db, payload)


@router.get("/generations/{generation_id}", response_model=TryOnGenerationRead)
def get_generation(
    generation_id: int,
    db: Session = Depends(get_db),
):
    generation = tryon_service.get_generation_by_id(db, generation_id)
    if generation is None:
        raise HTTPException(status_code=404, detail="Generation not found")
    return generation
