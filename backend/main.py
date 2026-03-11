import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.api import events, health, user, widgets
from backend.database.session import init_db
from hardware.gpio import service as gpio_service


def create_app() -> FastAPI:
    init_db()

    app = FastAPI(title="Smart Mirror Backend")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(widgets.router, prefix="/api")
    app.include_router(user.router, prefix="/api")
    app.include_router(health.router, prefix="/api")
    app.include_router(events.router)

    # Serve UI under /ui to avoid conflicts with WebSocket routes
    app.mount("/ui", StaticFiles(directory="ui", html=True), name="ui")

    @app.on_event("startup")
    async def _startup() -> None:  # type: ignore[func-returns-value]
        if os.getenv("ENABLE_GPIO", "false").lower() == "true":
            gpio_service.start_button_service()

    @app.on_event("shutdown")
    async def _shutdown() -> None:  # type: ignore[func-returns-value]
        gpio_service.stop_button_service()

    return app


app = create_app()

