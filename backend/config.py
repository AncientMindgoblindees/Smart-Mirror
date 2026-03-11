import os
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent.parent


def get_db_path() -> Path:
    """
    Resolve the SQLite database path.
    Uses MIRROR_DB_PATH or DATABASE_URL if provided; otherwise defaults to ./data/mirror.db.
    """
    env_path = os.getenv("MIRROR_DB_PATH")
    if env_path:
        return Path(env_path)

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

