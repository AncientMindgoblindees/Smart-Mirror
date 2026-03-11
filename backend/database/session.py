from sqlalchemy import create_engine
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


def get_db():
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()

