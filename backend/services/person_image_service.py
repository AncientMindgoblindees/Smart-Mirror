import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session

from backend.database.models import PersonImage

PERSON_IMAGE_DIR = Path("data/person_images")
PERSON_IMAGE_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


async def save_person_image(db: Session, file: UploadFile) -> PersonImage:
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing filename")

    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type. Use jpg, jpeg, png, or webp.",
        )

    unique_name = f"{uuid.uuid4()}{ext}"
    save_path = PERSON_IMAGE_DIR / unique_name

    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    with open(save_path, "wb") as f:
        f.write(contents)

    person_image = PersonImage(
        file_path=str(save_path),
        status="uploaded",
    )

    db.add(person_image)
    db.commit()
    db.refresh(person_image)

    return person_image