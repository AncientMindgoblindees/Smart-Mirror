import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
# Repo .env first (works no matter what cwd is when uvicorn imports this module).
load_dotenv(BASE_DIR / ".env")
load_dotenv()  # optional: cwd .env overrides for local dev


def _cloudflared_config_path() -> Path:
    override = os.getenv("CLOUDFLARED_CONFIG", "").strip()
    if override:
        return Path(override).expanduser()
    return Path.home() / ".cloudflared" / "config.yml"


def _cloudflared_hostnames() -> list[str]:
    config_path = _cloudflared_config_path()
    if not config_path.exists():
        return []

    hostnames: list[str] = []
    try:
        for raw_line in config_path.read_text(encoding="utf-8", errors="ignore").splitlines():
            line = raw_line.strip()
            if not line.startswith("hostname:"):
                continue
            hostname = line.split(":", 1)[1].strip().strip("'\"")
            if hostname:
                hostnames.append(hostname)
    except OSError:
        return []

    return hostnames


def get_oauth_public_base_url(request_base_url: str | None = None) -> str:
    configured = os.getenv("OAUTH_PUBLIC_BASE_URL", "").strip()
    if configured:
        return configured.rstrip("/")

    hostnames = _cloudflared_hostnames()
    if hostnames:
        preferred = next((host for host in hostnames if host.startswith("mirror.")), hostnames[0])
        return f"https://{preferred}"

    return (request_base_url or "").rstrip("/")


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

LEONARDO_API_KEY = os.getenv("LEONARDO_API_KEY", "")
LEONARDO_API_BASE = os.getenv("LEONARDO_API_BASE", "https://cloud.leonardo.ai/api/rest/v1")
LEONARDO_MODEL_ID = os.getenv(
    "LEONARDO_MODEL_ID",
    "b24e16ff-06e3-43eb-8d33-4416c2d75876",
)
LEONARDO_GENERATION_POLL_SEC = float(os.getenv("LEONARDO_GENERATION_POLL_SEC", "2"))
LEONARDO_GENERATION_TIMEOUT_SEC = float(os.getenv("LEONARDO_GENERATION_TIMEOUT_SEC", "120"))

# Portrait-oriented default framing for mirror composition.
PI_CAMERA_CAPTURE_WIDTH = int(os.getenv("PI_CAMERA_CAPTURE_WIDTH", "1440"))
PI_CAMERA_CAPTURE_HEIGHT = int(os.getenv("PI_CAMERA_CAPTURE_HEIGHT", "1920"))
PI_CAMERA_MAX_DIM = int(os.getenv("PI_CAMERA_MAX_DIM", "1280"))
# Long-edge cap for Picamera2 lores frames used for MJPEG live view only (/api/camera/live).
PI_CAMERA_PREVIEW_LORES_MAX = int(os.getenv("PI_CAMERA_PREVIEW_LORES_MAX", "640"))
PI_CAMERA_JPEG_QUALITY = int(os.getenv("PI_CAMERA_JPEG_QUALITY", "82"))
CAMERA_CAPTURE_BUTTON = os.getenv("CAMERA_CAPTURE_BUTTON", "UP").upper()
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

TRYON_LOCAL_KEEP_LAST = int(os.getenv("TRYON_LOCAL_KEEP_LAST", "10"))
