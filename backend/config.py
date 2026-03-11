import os
from dataclasses import dataclass
from pathlib import Path
from typing import Optional


BASE_DIR = Path(__file__).resolve().parent.parent


@dataclass(frozen=True)
class WeatherConfig:
    latitude: Optional[float]
    longitude: Optional[float]
    location_name: str
    timezone: str
    cache_ttl_seconds: int
    stale_if_error_seconds: int
    http_timeout_seconds: float


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


def _get_env_float(name: str) -> Optional[float]:
    value = os.getenv(name)
    if value is None or value == "":
        return None
    try:
        return float(value)
    except ValueError:
        return None


def _get_env_int(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None or value == "":
        return default
    try:
        return int(value)
    except ValueError:
        return default


def _get_env_float_with_default(name: str, default: float) -> float:
    value = os.getenv(name)
    if value is None or value == "":
        return default
    try:
        return float(value)
    except ValueError:
        return default


def get_weather_config() -> WeatherConfig:
    return WeatherConfig(
        latitude=_get_env_float("WEATHER_LAT"),
        longitude=_get_env_float("WEATHER_LON"),
        location_name=os.getenv("WEATHER_LOCATION_NAME", "Home"),
        timezone=os.getenv("WEATHER_TIMEZONE", "auto"),
        cache_ttl_seconds=_get_env_int("WEATHER_CACHE_TTL_SECONDS", 600),
        stale_if_error_seconds=_get_env_int("WEATHER_STALE_IF_ERROR_SECONDS", 3600),
        http_timeout_seconds=_get_env_float_with_default(
            "WEATHER_HTTP_TIMEOUT_SECONDS", 5.0
        ),
    )

