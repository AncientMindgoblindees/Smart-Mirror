from __future__ import annotations

from pathlib import Path
from typing import Optional

import httpx
from fastapi import HTTPException, Request

from backend import config

TRYON_RESULT_DIR = Path("data/tryon_results")
TRYON_RESULT_DIR.mkdir(parents=True, exist_ok=True)


def _safe_result_path(filename: str) -> Path:
    path = (TRYON_RESULT_DIR / filename).resolve()
    base = TRYON_RESULT_DIR.resolve()
    try:
        path.relative_to(base)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid generated image path") from exc
    return path


def resolve_generated_image_path(filename: str) -> Path:
    path = _safe_result_path(filename)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Generated try-on image not found")
    return path


def store_remote_result(generation_id: str, remote_url: str) -> Path:
    ext = ".jpg"
    for candidate in (".jpg", ".jpeg", ".png", ".webp"):
        if remote_url.lower().split("?")[0].endswith(candidate):
            ext = candidate
            break
    file_name = f"tryon_{generation_id}{ext}"
    path = _safe_result_path(file_name)

    with httpx.Client(timeout=60.0, follow_redirects=True) as client:
        response = client.get(remote_url)
        if response.status_code >= 400:
            raise HTTPException(
                status_code=502,
                detail=f"Failed downloading generated image: {response.status_code}",
            )
        path.write_bytes(response.content)
    return path


def prune_generated_results(keep_last: Optional[int] = None) -> None:
    keep = keep_last if keep_last is not None else config.TRYON_LOCAL_KEEP_LAST
    if keep < 1:
        keep = 1
    files = sorted(
        [p for p in TRYON_RESULT_DIR.glob("tryon_*") if p.is_file()],
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    for old in files[keep:]:
        old.unlink(missing_ok=True)


def build_generated_image_url(request: Request, filename: str) -> str:
    return str(request.url_for("get_generated_tryon_image", filename=filename))
