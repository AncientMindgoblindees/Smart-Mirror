import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
# Repo .env first (works no matter what cwd is when uvicorn imports this module).
load_dotenv(BASE_DIR / ".env")
load_dotenv()  # optional: cwd .env overrides for local dev


def get_db_path() -> Path:
    """
    Resolve the SQLite database path.
    Uses MIRROR_DB_PATH or DATABASE_URL if provided; otherwise defaults to ./data/mirror.db.
    """
    env_path = os.getenv("MIRROR_DB_PATH")
    if env_path:
        db_path = Path(env_path)
        db_path.parent.mkdir(parents=True, exist_ok=True)
        return db_path

    # Fallback to ./data/mirror.db under repo root
    data_dir = BASE_DIR / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir / "mirror.db"


def get_sqlalchemy_database_url() -> str:
    """
    Build the SQLAlchemy SQLite URL for the local DB.
    """
    # Allow full DATABASE_URL override if provided
    db_url = os.getenv("DATABASE_URL")
    if db_url:
        return db_url

    db_path = get_db_path()
    # Use absolute path to avoid ambiguity when running from different cwd
    return f"sqlite:///{db_path.as_posix()}"


D1_WORKER_URL = os.getenv("D1_WORKER_URL", "")
MIRROR_SYNC_TOKEN = os.getenv("MIRROR_SYNC_TOKEN", "")
D1_SYNC_INTERVAL_SEC = int(os.getenv("D1_SYNC_INTERVAL_SEC", "600"))

