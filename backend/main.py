from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.api import health, user, widgets
from backend.database.session import init_db


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
    app.include_router(user.router, prefix="/api")
    app.include_router(health.router, prefix="/api")

    app.mount("/", StaticFiles(directory="ui", html=True), name="ui")

    return app


app = create_app()

