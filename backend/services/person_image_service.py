import uuid
from pathlib import Path
from typing import Optional

from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session

from backend.database.models import PersonImage

PERSON_IMAGE_DIR = Path("data/person_images")
PERSON_IMAGE_DIR.mkdir(parents=True, exist_ok=True)


def _resolved_person_images_dir() -> Path:
    return PERSON_IMAGE_DIR.resolve()


def get_latest_person_image(db: Session) -> Optional[PersonImage]:
    return db.query(PersonImage).order_by(PersonImage.created_at.desc()).first()


def get_person_image_by_id(db: Session, image_id: int) -> Optional[PersonImage]:
    return db.query(PersonImage).filter(PersonImage.id == image_id).first()


def resolve_safe_image_path(record: PersonImage) -> Path:
    raw = Path(record.file_path)
    path = raw if raw.is_absolute() else (Path.cwd() / raw).resolve()
    base = _resolved_person_images_dir()
    try:
        path.relative_to(base)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid image path") from exc
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Image file missing on disk")
    return path

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