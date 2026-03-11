from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session, sessionmaker

from backend.config import get_sqlalchemy_database_url
from backend.database.models import Base


SQLALCHEMY_DATABASE_URL = get_sqlalchemy_database_url()

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False} if SQLALCHEMY_DATABASE_URL.startswith("sqlite") else {},
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def _ensure_widget_layout_columns() -> None:
    inspector = inspect(engine)
    if "widget_config" not in inspector.get_table_names():
        return

    existing = {column["name"] for column in inspector.get_columns("widget_config")}
    required = {
        "zone": "ALTER TABLE widget_config ADD COLUMN zone VARCHAR(32) NOT NULL DEFAULT 'ambient'",
        "display_order": "ALTER TABLE widget_config ADD COLUMN display_order INTEGER NOT NULL DEFAULT 100",
        "row_span": "ALTER TABLE widget_config ADD COLUMN row_span INTEGER NOT NULL DEFAULT 1",
        "col_span": "ALTER TABLE widget_config ADD COLUMN col_span INTEGER NOT NULL DEFAULT 1",
    }

    with engine.begin() as connection:
        for column_name, statement in required.items():
            if column_name not in existing:
                connection.execute(text(statement))


def init_db() -> None:
    """
    Initialize database tables for Phase 1.
    This uses SQLAlchemy's create_all for simplicity; Alembic can be layered on later.
    """
    Base.metadata.create_all(bind=engine)
    _ensure_widget_layout_columns()


def get_db():
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()

