from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from backend.database.models import WardrobeItem
from backend.database.session import get_db
from backend.schemas.wardrobe import (
    WardrobeItemOut,
    WardrobeTryOnPreviewRequest,
    WardrobeTryOnPreviewResponse,
)

router = APIRouter(prefix="/wardrobe", tags=["wardrobe"])

UPLOADS_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "wardrobe_uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)


@router.get("/items", response_model=list[WardrobeItemOut], summary="List wardrobe items")
def list_wardrobe_items(
    user_id: str = "local-dev",
    db: Session = Depends(get_db),
) -> list[WardrobeItemOut]:
    return (
        db.query(WardrobeItem)
        .filter(WardrobeItem.user_id == user_id)
        .order_by(WardrobeItem.created_at.desc(), WardrobeItem.id.desc())
        .all()
    )


@router.post("/items", response_model=WardrobeItemOut, summary="Upload wardrobe item")
async def upload_wardrobe_item(
    file: UploadFile = File(...),
    user_id: str = Form("local-dev"),
    name: str = Form(""),
    category: str = Form(""),
    db: Session = Depends(get_db),
) -> WardrobeItemOut:
    original_name = file.filename or "item"
    safe_name = original_name.replace("\\", "_").replace("/", "_")
    ext = Path(safe_name).suffix.lower() or ".jpg"
    file_name = f"{uuid4().hex}{ext}"
    disk_path = UPLOADS_DIR / file_name

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="empty upload")
    disk_path.write_bytes(content)

    item = WardrobeItem(
        user_id=user_id.strip() or "local-dev",
        name=(name.strip() or Path(safe_name).stem[:128]),
        category=(category.strip() or None),
        image_url=f"/api/wardrobe/files/{file_name}",
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/items/{item_id}", summary="Delete wardrobe item")
def delete_wardrobe_item(item_id: int, db: Session = Depends(get_db)) -> dict:
    item = db.query(WardrobeItem).filter(WardrobeItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="item not found")
    file_name = Path(item.image_url).name
    file_path = UPLOADS_DIR / file_name
    if file_path.exists():
        file_path.unlink()
    db.delete(item)
    db.commit()
    return {"status": "ok"}


@router.get("/files/{file_name}", summary="Serve wardrobe image")
def get_wardrobe_file(file_name: str) -> FileResponse:
    file_path = UPLOADS_DIR / file_name
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="file not found")
    return FileResponse(file_path)


@router.post(
    "/virtual-try-on/preview",
    response_model=WardrobeTryOnPreviewResponse,
    summary="Create virtual try-on preview (stub)",
)
def create_virtual_try_on_preview(
    req: WardrobeTryOnPreviewRequest,
    db: Session = Depends(get_db),
) -> WardrobeTryOnPreviewResponse:
    item = (
        db.query(WardrobeItem)
        .filter(WardrobeItem.id == req.wardrobe_item_id, WardrobeItem.user_id == req.user_id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="wardrobe item not found")
    return WardrobeTryOnPreviewResponse(
        preview_url=item.image_url,
        message="Preview pipeline stub: integrate your try-on model service here.",
    )
