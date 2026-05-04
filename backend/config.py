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
# One-shot: reset D1 pull cursors to epoch and full-sync on next startup (then disable in .env).
D1_FORCE_FULL_SYNC = os.getenv("D1_FORCE_FULL_SYNC", "").lower() in ("1", "true", "yes")

# Portrait-oriented default framing for mirror composition.
PI_CAMERA_CAPTURE_WIDTH = int(os.getenv("PI_CAMERA_CAPTURE_WIDTH", "1440"))
PI_CAMERA_CAPTURE_HEIGHT = int(os.getenv("PI_CAMERA_CAPTURE_HEIGHT", "1920"))
PI_CAMERA_MAX_DIM = int(os.getenv("PI_CAMERA_MAX_DIM", "1280"))
# Long-edge cap for Picamera2 lores frames used for MJPEG live view only (/api/camera/live).
PI_CAMERA_PREVIEW_LORES_MAX = int(os.getenv("PI_CAMERA_PREVIEW_LORES_MAX", "640"))
PI_CAMERA_JPEG_QUALITY = int(os.getenv("PI_CAMERA_JPEG_QUALITY", "82"))
CAMERA_CAPTURE_COUNTDOWN_SEC = int(os.getenv("CAMERA_CAPTURE_COUNTDOWN_SEC", "3"))
# Minimum time from capture start (after LOADING_STARTED) before countdown WebSocket events, so the mirror can show boot + live preview without losing countdown seconds.
CAMERA_MIN_BOOT_BEFORE_COUNTDOWN_SEC = float(
    os.getenv("CAMERA_MIN_BOOT_BEFORE_COUNTDOWN_SEC", "2.5")
)
# Max MJPEG frames per second from GET /api/camera/live (Pi CPU / USB bandwidth).
CAMERA_MJPEG_MAX_FPS = float(os.getenv("CAMERA_MJPEG_MAX_FPS", "30"))
# If enabled, use native `rpicam-hello` preview window during capture flow
# (mirror UI shows controls/countdown only; no browser live decode).
CAMERA_NATIVE_PREVIEW = os.getenv("CAMERA_NATIVE_PREVIEW", "0").lower() in ("1", "true", "yes")
# If enabled, run a small native overlay window for countdown text on top of preview.
CAMERA_NATIVE_COUNTDOWN_OVERLAY = os.getenv("CAMERA_NATIVE_COUNTDOWN_OVERLAY", "1").lower() in (
    "1",
    "true",
    "yes",
)

# Allow GPIO power-button interrupt to request host shutdown.
# Keep disabled by default for safety on non-Pi/dev machines.
ALLOW_PI_SHUTDOWN_BUTTON = os.getenv("ALLOW_PI_SHUTDOWN_BUTTON", "0").lower() in (
    "1",
    "true",
    "yes",
)
PI_SHUTDOWN_COMMAND = os.getenv("PI_SHUTDOWN_COMMAND", "sudo /sbin/shutdown -h now")

