from __future__ import annotations

from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from backend.api import tryon as tryon_api
from backend.database.models import Base, ClothingImage, ClothingItem, PersonImage, TryOnGeneration
from backend.services import tryon_service


@pytest.fixture()
def db_session(tmp_path: Path):
    db_path = tmp_path / "test_tryon.db"
    engine = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    LocalSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = LocalSession()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture()
def client(db_session: Session):
    app = FastAPI()
    app.include_router(tryon_api.router, prefix="/api")

    def _override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[tryon_api.get_db] = _override_get_db
    return TestClient(app)


@pytest.mark.asyncio
async def test_cache_clothing_images_hit_miss_and_fail(tmp_path: Path, db_session: Session, monkeypatch: pytest.MonkeyPatch):
    item = ClothingItem(name="Top", category="top")
    db_session.add(item)
    db_session.commit()
    db_session.refresh(item)

    miss_row = ClothingImage(clothing_item_id=item.id, storage_provider="cloudinary", storage_key="k1", image_url="https://x.example/miss.jpg")
    hit_row = ClothingImage(clothing_item_id=item.id, storage_provider="cloudinary", storage_key="k2", image_url="https://x.example/hit.jpg")
    fail_row = ClothingImage(clothing_item_id=item.id, storage_provider="cloudinary", storage_key="k3", image_url="https://x.example/fail.jpg")
    db_session.add_all([miss_row, hit_row, fail_row])
    db_session.commit()
    db_session.refresh(miss_row)
    db_session.refresh(hit_row)
    db_session.refresh(fail_row)

    monkeypatch.setattr(tryon_service, "WARDROBE_RUNTIME_CACHE_DIR", tmp_path / "wardrobe_runtime_cache")
    tryon_service.WARDROBE_RUNTIME_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    tryon_service._RUNTIME_CLOTHING_FILE_CACHE.clear()

    hit_file = tryon_service.WARDROBE_RUNTIME_CACHE_DIR / f"clothing-{hit_row.id}.jpg"
    hit_file.write_bytes(b"hit")
    tryon_service._RUNTIME_CLOTHING_FILE_CACHE[hit_row.id] = str(hit_file)

    async def _fake_download(image_id: int, image_url: str) -> Path:
        if image_id == fail_row.id:
            raise RuntimeError("download failed")
        out = tryon_service.WARDROBE_RUNTIME_CACHE_DIR / f"clothing-{image_id}.jpg"
        out.write_bytes(image_url.encode("utf-8"))
        return out

    monkeypatch.setattr(tryon_service, "_download_clothing_to_runtime_cache", _fake_download)

    result = await tryon_service.cache_clothing_images(
        db_session,
        [miss_row.id, hit_row.id, fail_row.id],
    )

    assert set(result["cached_image_ids"]) == {miss_row.id, hit_row.id}
    assert set(result["cache_hit_image_ids"]) == {hit_row.id}
    assert set(result["cloudinary_fetch_image_ids"]) == {miss_row.id}
    assert set(result["cache_failed_image_ids"]) == {fail_row.id}


def test_get_generation_image_serves_local_file(tmp_path: Path, db_session: Session, client: TestClient, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(tryon_service, "TRYON_OUTPUT_DIR", tmp_path / "tryon")
    tryon_service.TRYON_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    person = PersonImage(file_path=str(tmp_path / "person.jpg"), status="uploaded")
    db_session.add(person)
    db_session.commit()
    db_session.refresh(person)

    generation = TryOnGeneration(person_image_id=person.id, status="completed")
    db_session.add(generation)
    db_session.commit()
    db_session.refresh(generation)

    expected_bytes = b"local-generated-image"
    local_file = tryon_service.TRYON_OUTPUT_DIR / f"generation-{generation.id}-abc.jpg"
    local_file.write_bytes(expected_bytes)

    resp = client.get(f"/api/tryon/generations/{generation.id}/image")
    assert resp.status_code == 200
    assert resp.content == expected_bytes


@pytest.mark.asyncio
async def test_process_wrapper_broadcasts_tryon_result(monkeypatch: pytest.MonkeyPatch):
    sent: list[dict] = []

    class _FakeSession:
        def close(self):
            return None

    async def _fake_process_generation(db, generation_id: int):
        class _Generation:
            id = generation_id
            result_image_url = f"/api/tryon/generations/{generation_id}/image"

        return _Generation()

    async def _fake_broadcast(payload: dict):
        sent.append(payload)

    monkeypatch.setattr(tryon_api, "SessionLocal", lambda: _FakeSession())
    monkeypatch.setattr(tryon_api.tryon_service, "process_generation", _fake_process_generation)
    monkeypatch.setattr(tryon_api.control_registry, "broadcast", _fake_broadcast)

    await tryon_api._process_tryon_generation(42)

    assert len(sent) == 1
    payload = sent[0]
    assert payload["type"] == "TRYON_RESULT"
    assert payload["payload"]["generation_id"] == "42"
    assert payload["payload"]["image_url"] == "/api/tryon/generations/42/image"


def test_cache_clothing_endpoint_reports_hit_and_miss(
    tmp_path: Path, db_session: Session, client: TestClient, monkeypatch: pytest.MonkeyPatch
):
    item = ClothingItem(name="Shirt", category="top")
    db_session.add(item)
    db_session.commit()
    db_session.refresh(item)

    miss_row = ClothingImage(clothing_item_id=item.id, storage_provider="cloudinary", storage_key="k1", image_url="https://x.example/miss.jpg")
    hit_row = ClothingImage(clothing_item_id=item.id, storage_provider="cloudinary", storage_key="k2", image_url="https://x.example/hit.jpg")
    db_session.add_all([miss_row, hit_row])
    db_session.commit()
    db_session.refresh(miss_row)
    db_session.refresh(hit_row)

    monkeypatch.setattr(tryon_service, "WARDROBE_RUNTIME_CACHE_DIR", tmp_path / "wardrobe_runtime_cache")
    tryon_service.WARDROBE_RUNTIME_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    tryon_service._RUNTIME_CLOTHING_FILE_CACHE.clear()

    hit_file = tryon_service.WARDROBE_RUNTIME_CACHE_DIR / f"clothing-{hit_row.id}.jpg"
    hit_file.write_bytes(b"hit")
    tryon_service._RUNTIME_CLOTHING_FILE_CACHE[hit_row.id] = str(hit_file)

    async def _fake_download(image_id: int, image_url: str) -> Path:
        out = tryon_service.WARDROBE_RUNTIME_CACHE_DIR / f"clothing-{image_id}.jpg"
        out.write_bytes(image_url.encode("utf-8"))
        return out

    monkeypatch.setattr(tryon_service, "_download_clothing_to_runtime_cache", _fake_download)

    resp = client.post(
        "/api/tryon/cache-clothing",
        json={"image_ids": [miss_row.id, hit_row.id]},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert set(body["cache_hit_image_ids"]) == {hit_row.id}
    assert set(body["cloudinary_fetch_image_ids"]) == {miss_row.id}
    assert body["cache_failed_image_ids"] == []
