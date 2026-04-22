from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

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