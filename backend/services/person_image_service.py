import uuid
from pathlib import Path
from typing import Optional

from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session

from backend.database.models import PersonImage

PERSON_IMAGE_DIR = Path("data/person_images")
PERSON_IMAGE_DIR.mkdir(parents=True, exist_ok=True)
LATEST_PERSON_IMAGE_PATH = PERSON_IMAGE_DIR / "latest_person.jpg"


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


def _delete_all_rows_and_files(db: Session, keep_path: Path | None = None) -> None:
    keep_resolved = keep_path.resolve() if keep_path else None
    rows = db.query(PersonImage).all()
    for row in rows:
        try:
            path = resolve_safe_image_path(row)
            if keep_resolved is not None and path.resolve() == keep_resolved:
                continue
            path.unlink(missing_ok=True)
        except HTTPException:
            pass
    db.query(PersonImage).delete()
    for pattern in ("*.jpg", "*.jpeg", "*.png", "*.webp"):
        for file_path in PERSON_IMAGE_DIR.glob(pattern):
            try:
                if keep_resolved is not None and file_path.resolve() == keep_resolved:
                    continue
                file_path.unlink(missing_ok=True)
            except OSError:
                pass


def set_latest_person_image_path(db: Session, path: Path, status: str = "captured") -> PersonImage:
    _delete_all_rows_and_files(db, keep_path=path)
    person_image = PersonImage(file_path=str(path), status=status)
    db.add(person_image)
    db.commit()
    db.refresh(person_image)
    return person_image


def clear_person_images(db: Session) -> None:
    _delete_all_rows_and_files(db)
    db.commit()


async def save_person_image(db: Session, file: UploadFile) -> PersonImage:
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing filename")

    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type. Use jpg, jpeg, png, or webp.",
        )

    canonical_ext = ".jpg" if ext in {".jpg", ".jpeg"} else ext
    tmp_name = f"{uuid.uuid4()}{canonical_ext}"
    tmp_path = PERSON_IMAGE_DIR / tmp_name

    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    with open(tmp_path, "wb") as f:
        f.write(contents)
    tmp_path.replace(LATEST_PERSON_IMAGE_PATH)

    return set_latest_person_image_path(db, LATEST_PERSON_IMAGE_PATH, status="uploaded")
