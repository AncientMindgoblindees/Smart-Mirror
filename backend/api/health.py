from typing import Any
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter

from backend import config

router = APIRouter(tags=["health"])


@router.get("/health", summary="Health check")
def health() -> dict:
    return {"status": "ok"}


@router.get("/health/d1", summary="Check Cloudflare D1 sync worker reachability and auth")
async def health_d1() -> dict[str, Any]:
    """
    Calls the worker ``GET /health`` with the same bearer token used for sync.
    Use on the Pi to verify ``D1_WORKER_URL`` and ``MIRROR_SYNC_TOKEN`` without reading logs.
    """
    base = (config.D1_WORKER_URL or "").strip().rstrip("/")
    token = (config.MIRROR_SYNC_TOKEN or "").strip()
    if not base or not token:
        return {
            "d1_configured": False,
            "ok": False,
            "detail": "Set D1_WORKER_URL and MIRROR_SYNC_TOKEN in .env to enable D1 sync.",
        }
    url = f"{base}/health"
    host = urlparse(base).netloc or base
    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            response = await client.get(
                url,
                headers={"Authorization": f"Bearer {token}"},
            )
    except Exception as exc:
        return {
            "d1_configured": True,
            "ok": False,
            "worker_host": host,
            "detail": f"HTTP client error: {exc}",
        }
    text = (response.text or "")[:300]
    ok = response.status_code == 200
    if response.status_code == 401:
        detail = "Unauthorized: MIRROR_SYNC_TOKEN on the Pi does not match wrangler secret MIRROR_SYNC_TOKEN on the worker."
    elif not ok:
        detail = text or f"HTTP {response.status_code}"
    else:
        detail = "Worker /health returned 200; sync should be able to reach this host."
    return {
        "d1_configured": True,
        "ok": ok,
        "status_code": response.status_code,
        "worker_host": host,
        "detail": detail,
    }

