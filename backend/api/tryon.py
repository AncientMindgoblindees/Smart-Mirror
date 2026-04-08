from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.orm import Session

from backend.database.session import get_db
from backend.schemas.person_image import PersonImageRead
from backend.services import person_image_service

router = APIRouter(prefix="/tryon", tags=["tryon"])


@router.post("/person-image", response_model=PersonImageRead, status_code=201)
async def upload_person_image(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    return await person_image_service.save_person_image(db, file)