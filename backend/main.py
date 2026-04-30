import os
from pathlib import Path
from typing import Iterable

from dotenv import load_dotenv

# Load repo .env before any backend.* import. Otherwise `backend.config` reads
# MIRROR_SYNC_TOKEN / D1_WORKER_URL at import time while they are still unset.
BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.responses import Response

from backend.api import (
    auth,
    calendar,
    camera,
    clothing,
    d1_checkpoint,
    email,
    events,
    health,
    oauth_provider,
    oauth_web,
    tryon,
    user,
    weather,
    widgets,
)
from backend.api.security import require_api_token
from backend.database.session import init_db
from backend.services.runtime_singleton import acquire_single_instance_or_raise, release_single_instance
from hardware.gpio import service as gpio_service

UI_DIST = BASE_DIR / "ui" / "dist"


def _cors_origins() -> list[str]:
    configured = os.getenv("MIRROR_CORS_ORIGINS", "").strip()
    if configured:
        values: Iterable[str] = (item.strip() for item in configured.split(","))
        return [item for item in values if item]
    return [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://smart-mirror.tech",
        "https://mirror.smart-mirror.tech",
    ]


def _cors_origin_regex() -> str:
    configured = os.getenv("MIRROR_CORS_ORIGIN_REGEX", "").strip()
    if configured:
        return configured
    # Local dev + LAN hosts, any port:
    #   http://localhost:5173, http://127.0.0.1:4173, http://192.168.1.50:3000
    return r"^https?://(localhost|127\.0\.0\.1|(?:\d{1,3}\.){3}\d{1,3})(:\d+)?$"


def create_app() -> FastAPI:
    init_db()

    app = FastAPI(title="Smart Mirror Backend")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=_cors_origins(),
        allow_origin_regex=_cors_origin_regex(),
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    secure_api = [Depends(require_api_token)]
    app.include_router(widgets.router, prefix="/api", dependencies=secure_api)
    app.include_router(weather.router, prefix="/api", dependencies=secure_api)
    app.include_router(user.router, prefix="/api", dependencies=secure_api)
    app.include_router(health.router, prefix="/api")
    app.include_router(camera.router, prefix="/api", dependencies=secure_api)
    app.include_router(auth.router, prefix="/api", dependencies=secure_api)
    app.include_router(oauth_web.router, prefix="/api")
    app.include_router(oauth_provider.router, prefix="/api", dependencies=secure_api)
    app.include_router(calendar.router, prefix="/api", dependencies=secure_api)
    app.include_router(email.router, prefix="/api", dependencies=secure_api)
    app.include_router(events.router)
    app.include_router(clothing.router, prefix="/api", dependencies=secure_api)
    app.include_router(tryon.router, prefix="/api", dependencies=secure_api)
    app.include_router(tryon.public_router, prefix="/api")
    app.include_router(d1_checkpoint.router, prefix="/api", dependencies=secure_api)

    # Serve built React UI under /ui (run: cd ui && npm install && npm run build)
    static_ui = StaticFiles(directory=str(UI_DIST), html=True)

    async def ui_app(scope, receive, send):  # type: ignore[func-returns-value]
        if scope["type"] != "http":
            resp = Response(status_code=404)
            await resp(scope, receive, send)
            return
        await static_ui(scope, receive, send)

    app.mount("/ui", ui_app, name="ui")

    @app.on_event("startup")
    async def _startup() -> None:  # type: ignore[func-returns-value]
        acquire_single_instance_or_raise("smart-mirror-backend")

        from backend.services.camera_service import camera_state
        await camera_state.reset_person_image_state()

        if os.getenv("ENABLE_GPIO", "false").lower() == "true":
            gpio_service.start_button_service()

        from backend.services.sync_service import sync_manager
        await sync_manager.start_all()
        from backend.services.d1_sync import d1_sync_service
        await d1_sync_service.start()

    @app.on_event("shutdown")
    async def _shutdown() -> None:  # type: ignore[func-returns-value]
        gpio_service.stop_button_service()
        from backend.services.camera_service import camera_state
        await camera_state.shutdown()

        from backend.services.sync_service import sync_manager
        sync_manager.stop_all()
        from backend.services.d1_sync import d1_sync_service
        await d1_sync_service.stop()
        release_single_instance()

    return app


app = create_app()

