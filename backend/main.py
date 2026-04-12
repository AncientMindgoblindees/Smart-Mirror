import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.responses import Response

from backend.api import auth, calendar, camera, events, health, oauth_web, user, wardrobe, weather, widgets, tryon, clothing
from backend.database.session import init_db
from hardware.gpio import service as gpio_service

BASE_DIR = Path(__file__).resolve().parent.parent
UI_DIST = BASE_DIR / "ui" / "dist"

load_dotenv(BASE_DIR / ".env")


def create_app() -> FastAPI:
    init_db()

    app = FastAPI(title="Smart Mirror Backend")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(widgets.router, prefix="/api")
    app.include_router(weather.router, prefix="/api")
    app.include_router(user.router, prefix="/api")
    app.include_router(health.router, prefix="/api")
    app.include_router(camera.router, prefix="/api")
    app.include_router(wardrobe.router, prefix="/api")
    app.include_router(auth.router, prefix="/api")
    app.include_router(oauth_web.router, prefix="/api")
    app.include_router(calendar.router, prefix="/api")
    app.include_router(events.router)
    app.include_router(clothing.router, prefix="/api")
    app.include_router(tryon.router, prefix="/api")

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
        if os.getenv("ENABLE_GPIO", "false").lower() == "true":
            gpio_service.start_button_service()

        from backend.services.sync_service import sync_manager
        await sync_manager.start_all()

    @app.on_event("shutdown")
    async def _shutdown() -> None:  # type: ignore[func-returns-value]
        gpio_service.stop_button_service()

        from backend.services.sync_service import sync_manager
        sync_manager.stop_all()

    return app


app = create_app()

