"""
Leonardo.Ai REST client: init image upload + image-to-image generation + polling.
See https://docs.leonardo.ai/docs/getting-started
"""

from __future__ import annotations

import json
import logging
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx

from backend import config

logger = logging.getLogger(__name__)


class LeonardoError(Exception):
    pass


def _headers() -> Dict[str, str]:
    key = config.LEONARDO_API_KEY.strip()
    if not key:
        raise LeonardoError("LEONARDO_API_KEY is not configured")
    return {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


def _extension_for_path(path: Path) -> str:
    ext = path.suffix.lower().lstrip(".")
    if ext in ("jpg", "jpeg", "png", "webp"):
        return "jpg" if ext == "jpeg" else ext
    raise LeonardoError(f"Unsupported image extension for Leonardo init upload: {path.suffix}")


def upload_init_image_file(file_path: Path) -> str:
    """
    POST /init-image, upload bytes to presigned URL, return init image id for generations.
    """
    ext = _extension_for_path(file_path)
    base = config.LEONARDO_API_BASE.rstrip("/")
    with httpx.Client(timeout=60.0) as client:
        r = client.post(
            f"{base}/init-image",
            headers=_headers(),
            json={"extension": ext},
        )
        if r.status_code >= 400:
            raise LeonardoError(f"init-image failed: {r.status_code} {r.text[:500]}")
        data = r.json()
        block = data.get("uploadInitImage") or data.get("uploadDatasetImage")
        if not block:
            raise LeonardoError(f"Unexpected init-image response: {data!r}")
        init_id = block.get("id")
        url = block.get("url")
        fields_raw = block.get("fields")
        if not init_id or not url or fields_raw is None:
            raise LeonardoError(f"Incomplete init-image payload: {block!r}")
        fields = json.loads(fields_raw) if isinstance(fields_raw, str) else fields_raw
        if not isinstance(fields, dict):
            raise LeonardoError("init-image fields must be a JSON object")

        with file_path.open("rb") as f:
            up = client.post(url, data=fields, files={"file": (file_path.name, f, "application/octet-stream")})
        if up.status_code >= 400:
            raise LeonardoError(f"Presigned upload failed: {up.status_code} {up.text[:300]}")

    return str(init_id)


def create_img2img_generation(
    *,
    init_image_id: str,
    prompt: str,
    image_prompt_urls: List[str],
    model_id: Optional[str] = None,
    num_images: int = 1,
    init_strength: float = 0.42,
    width: int = 768,
    height: int = 768,
) -> str:
    """POST /generations — returns generationId (UUID string)."""
    mid = (model_id or config.LEONARDO_MODEL_ID).strip()
    body: Dict[str, Any] = {
        "prompt": prompt,
        "modelId": mid,
        "num_images": num_images,
        "width": width,
        "height": height,
        "init_image_id": init_image_id,
        "init_strength": init_strength,
        "alchemy": True,
    }
    if image_prompt_urls:
        body["imagePrompts"] = image_prompt_urls
        body["imagePromptWeight"] = 0.45

    base = config.LEONARDO_API_BASE.rstrip("/")
    with httpx.Client(timeout=60.0) as client:
        r = client.post(f"{base}/generations", headers=_headers(), json=body)
        if r.status_code >= 400:
            raise LeonardoError(f"generations create failed: {r.status_code} {r.text[:800]}")
        data = r.json()
        job = data.get("sdGenerationJob") or {}
        gen_id = job.get("generationId")
        if not gen_id:
            raise LeonardoError(f"No generationId in response: {data!r}")
        return str(gen_id)


def poll_generation_result(generation_id: str) -> str:
    """GET /generations/{id} until COMPLETE; return first generated image https URL."""
    base = config.LEONARDO_API_BASE.rstrip("/")
    deadline = time.monotonic() + config.LEONARDO_GENERATION_TIMEOUT_SEC
    last_status = ""
    with httpx.Client(timeout=60.0) as client:
        while time.monotonic() < deadline:
            r = client.get(f"{base}/generations/{generation_id}", headers=_headers())
            if r.status_code >= 400:
                raise LeonardoError(f"get generation failed: {r.status_code} {r.text[:500]}")
            data = r.json()
            gen = data.get("generations_by_pk")
            if not gen:
                raise LeonardoError(f"Unexpected get generation payload: {data!r}")
            last_status = str(gen.get("status") or "")
            if last_status == "COMPLETE":
                images = gen.get("generated_images") or []
                for img in images:
                    url = img.get("url")
                    if url:
                        return str(url)
                raise LeonardoError("Generation COMPLETE but no image URL returned")
            if last_status == "FAILED":
                raise LeonardoError("Leonardo generation FAILED")
            time.sleep(config.LEONARDO_GENERATION_POLL_SEC)
    raise LeonardoError(f"Leonardo generation timed out (last status={last_status!r})")


def run_virtual_try_on(
    person_image_path: Path,
    garment_image_urls: List[str],
    extra_prompt: Optional[str] = None,
) -> tuple[str, str]:
    """
    Upload person as init image, run img2img with garment URLs as image prompts.
    Returns (generation_id, result_image_url).
    """
    init_id = upload_init_image_file(person_image_path)
    base_prompt = (
        "Fashion virtual try-on: dress the person from the init image in the garments "
        "shown in the reference images. Keep pose, lighting, and identity coherent. "
        "Photorealistic clothing fit, natural folds, full outfit visible."
    )
    if extra_prompt:
        base_prompt = f"{base_prompt} {extra_prompt}"
    gen_id = create_img2img_generation(
        init_image_id=init_id,
        prompt=base_prompt,
        image_prompt_urls=garment_image_urls,
    )
    url = poll_generation_result(gen_id)
    return gen_id, url
