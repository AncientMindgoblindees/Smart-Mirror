from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from backend.config import get_sqlalchemy_database_url
from backend.database.models import Base


SQLALCHEMY_DATABASE_URL = get_sqlalchemy_database_url()

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False} if SQLALCHEMY_DATABASE_URL.startswith("sqlite") else {},
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_db() -> None:
    """
    Initialize database tables for Phase 1.
    This uses SQLAlchemy's create_all for simplicity; Alembic can be layered on later.
    """
    Base.metadata.create_all(bind=engine)
    _ensure_sync_columns()
    _ensure_d1_checkpoint_columns()


def _ensure_d1_checkpoint_columns() -> None:
    """Add D1 cursor columns to d1_sync_checkpoint for existing SQLite DBs."""
    if not SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
        return
    with engine.begin() as conn:
        rows = conn.execute(text("PRAGMA table_info(d1_sync_checkpoint)")).fetchall()
        columns = {str(row[1]) for row in rows}
        if not columns:
            return
        if "last_remote_cursor" not in columns:
            conn.execute(text("ALTER TABLE d1_sync_checkpoint ADD COLUMN last_remote_cursor VARCHAR(128)"))
        if "last_remote_cursor_id" not in columns:
            conn.execute(text("ALTER TABLE d1_sync_checkpoint ADD COLUMN last_remote_cursor_id INTEGER"))


def _ensure_sync_columns() -> None:
    """Backfill synced_at columns for existing SQLite databases."""
    if not SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
        return

    targets = ("widget_config", "user_settings", "clothing_item", "clothing_image")
    with engine.begin() as conn:
        for table in targets:
            rows = conn.execute(text(f"PRAGMA table_info({table})")).fetchall()
            columns = {str(row[1]) for row in rows}
            if "synced_at" in columns:
                continue
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN synced_at DATETIME"))


def get_db():
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()

