import os
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker


TEST_ROOT = (Path(__file__).resolve().parent / ".artifacts").resolve()
TEST_ROOT.mkdir(parents=True, exist_ok=True)
TEST_DB_PATH = TEST_ROOT / "test.db"
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB_PATH.resolve().as_posix()}"

from backend.database.models import Base  # noqa: E402
from backend.database.session import get_db  # noqa: E402
from backend.main import app  # noqa: E402
from backend.services import person_image_service, tryon_result_service  # noqa: E402


test_engine = create_engine(
    os.environ["DATABASE_URL"],
    connect_args={"check_same_thread": False},
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(autouse=True)
def clean_database():
    Base.metadata.drop_all(bind=test_engine)
    Base.metadata.create_all(bind=test_engine)
    yield
    Base.metadata.drop_all(bind=test_engine)


@pytest.fixture(autouse=True)
def isolated_storage(monkeypatch: pytest.MonkeyPatch):
    case_root = TEST_ROOT / f"case-{uuid4().hex}"
    case_root.mkdir(parents=True, exist_ok=True)

    person_dir = case_root / "person_images"
    person_dir.mkdir(parents=True, exist_ok=True)
    latest_person_image_path = person_dir / "latest_person.jpg"
    monkeypatch.setattr(person_image_service, "PERSON_IMAGE_DIR", person_dir)
    monkeypatch.setattr(person_image_service, "LATEST_PERSON_IMAGE_PATH", latest_person_image_path)

    tryon_dir = case_root / "tryon_results"
    tryon_dir.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(tryon_result_service, "TRYON_RESULT_DIR", tryon_dir)

    try:
        yield {
            "case_root": case_root,
            "person_dir": person_dir,
            "latest_person_image_path": latest_person_image_path,
            "tryon_dir": tryon_dir,
        }
    finally:
        for file_path in sorted(case_root.rglob("*"), reverse=True):
            if file_path.is_file():
                file_path.unlink(missing_ok=True)
            elif file_path.is_dir():
                file_path.rmdir()



@pytest.fixture
def db_session() -> Session:
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture
def client():
    app.dependency_overrides[get_db] = override_get_db
    test_client = TestClient(app)
    try:
        yield test_client
    finally:
        test_client.close()
        app.dependency_overrides.clear()
