from uuid import uuid4

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
    _ensure_multitenant_columns()
    _ensure_mirror_claim_columns()
    _ensure_sync_identity_columns()
    _ensure_soft_delete_columns()
    _ensure_pairing_bootstrap_columns()


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

    targets = (
        "mirrors",
        "user_profiles",
        "widget_config",
        "user_settings",
        "oauth_credentials",
        "clothing_item",
        "clothing_image",
        "household_memberships",
        "auth_pairings",
    )
    with engine.begin() as conn:
        for table in targets:
            rows = conn.execute(text(f"PRAGMA table_info({table})")).fetchall()
            columns = {str(row[1]) for row in rows}
            if not columns:
                continue
            if "synced_at" in columns:
                continue
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN synced_at DATETIME"))


def _ensure_sync_identity_columns() -> None:
    if not SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
        return

    targets = (
        "user_profiles",
        "widget_config",
        "user_settings",
        "oauth_credentials",
        "clothing_item",
        "clothing_image",
    )
    with engine.begin() as conn:
        for table in targets:
            rows = conn.execute(text(f"PRAGMA table_info({table})")).fetchall()
            columns = {str(row[1]) for row in rows}
            if not columns:
                continue
            if "sync_id" not in columns:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN sync_id VARCHAR(40)"))
            missing = conn.execute(
                text(f"SELECT rowid FROM {table} WHERE sync_id IS NULL OR TRIM(sync_id) = ''")
            ).fetchall()
            for (rowid,) in missing:
                conn.execute(
                    text(f"UPDATE {table} SET sync_id = :sync_id WHERE rowid = :rowid"),
                    {"sync_id": f"sync_{uuid4().hex}", "rowid": rowid},
                )
            conn.execute(
                text(f"CREATE UNIQUE INDEX IF NOT EXISTS uq_{table}_sync_id ON {table}(sync_id)")
            )


def _ensure_soft_delete_columns() -> None:
    if not SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
        return

    targets = (
        "user_profiles",
        "widget_config",
        "user_settings",
        "clothing_item",
        "clothing_image",
    )
    with engine.begin() as conn:
        for table in targets:
            rows = conn.execute(text(f"PRAGMA table_info({table})")).fetchall()
            columns = {str(row[1]) for row in rows}
            if not columns:
                continue
            if "deleted_at" not in columns:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN deleted_at DATETIME"))
            if table == "clothing_image":
                if "updated_at" not in columns:
                    conn.execute(text("ALTER TABLE clothing_image ADD COLUMN updated_at DATETIME"))
                if "user_id" not in columns:
                    conn.execute(text("ALTER TABLE clothing_image ADD COLUMN user_id VARCHAR(128)"))
                conn.execute(
                    text(
                        """
                        UPDATE clothing_image
                        SET updated_at = COALESCE(updated_at, created_at, CURRENT_TIMESTAMP)
                        WHERE updated_at IS NULL
                        """
                    )
                )
                conn.execute(
                    text(
                        """
                        UPDATE clothing_image
                        SET user_id = (
                          SELECT clothing_item.user_id
                          FROM clothing_item
                          WHERE clothing_item.id = clothing_image.clothing_item_id
                        )
                        WHERE user_id IS NULL OR TRIM(user_id) = ''
                        """
                    )
                )


def _ensure_multitenant_columns() -> None:
    if not SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
        return

    alter_map = {
        "widget_config": (
            ("mirror_id", "VARCHAR(36)"),
            ("user_id", "VARCHAR(128)"),
        ),
        "user_settings": (
            ("mirror_id", "VARCHAR(36)"),
            ("user_id", "VARCHAR(128)"),
        ),
        "clothing_item": (("user_id", "VARCHAR(128)"),),
        "calendar_event": (
            ("mirror_id", "VARCHAR(36)"),
            ("user_id", "VARCHAR(128)"),
        ),
    }
    with engine.begin() as conn:
        for table, additions in alter_map.items():
            rows = conn.execute(text(f"PRAGMA table_info({table})")).fetchall()
            columns = {str(row[1]) for row in rows}
            if not columns:
                continue
            for column_name, column_type in additions:
                if column_name in columns:
                    continue
                conn.execute(
                    text(
                        f"ALTER TABLE {table} ADD COLUMN {column_name} {column_type}"
                    )
                )


def _ensure_mirror_claim_columns() -> None:
    if not SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
        return
    with engine.begin() as conn:
        rows = conn.execute(text("PRAGMA table_info(mirrors)")).fetchall()
        columns = {str(row[1]) for row in rows}
        if not columns:
            return
        if "claimed_by_user_uid" not in columns:
            conn.execute(text("ALTER TABLE mirrors ADD COLUMN claimed_by_user_uid VARCHAR(128)"))
        if "claimed_at" not in columns:
            conn.execute(text("ALTER TABLE mirrors ADD COLUMN claimed_at DATETIME"))


def _ensure_pairing_bootstrap_columns() -> None:
    if not SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
        return
    with engine.begin() as conn:
        rows = conn.execute(text("PRAGMA table_info(auth_pairings)")).fetchall()
        columns = {str(row[1]) for row in rows}
        if not columns:
            return
        if "bootstrap_hardware_id" not in columns:
            conn.execute(text("ALTER TABLE auth_pairings ADD COLUMN bootstrap_hardware_id VARCHAR(128)"))
        if "bootstrap_hardware_token_enc" not in columns:
            conn.execute(text("ALTER TABLE auth_pairings ADD COLUMN bootstrap_hardware_token_enc VARCHAR(512)"))
        if "bootstrap_mirror_base_url" not in columns:
            conn.execute(text("ALTER TABLE auth_pairings ADD COLUMN bootstrap_mirror_base_url VARCHAR(1024)"))


def get_db():
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()

