from __future__ import annotations

import errno
import sys
from pathlib import Path

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

# Ensure `backend.*` imports resolve when pytest runs from repo root or backend/.
PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.api import tryon as tryon_api
from backend.database.models import Base, ClothingImage, ClothingItem, PersonImage, TryOnGeneration
from backend.schemas.tryon import TryOnRequest
from backend.services import tryon_service


@pytest.fixture()
def db_session(tmp_path: Path):
    db_path = tmp_path / "test_tryon_protocol.db"
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
    app.include_router(tryon_api.public_router, prefix="/api")

    def _override_get_db():
        yield db_session

    app.dependency_overrides[tryon_api.get_db] = _override_get_db
    return TestClient(app)


@pytest.fixture()
def isolated_tryon_dirs(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    output = tmp_path / "tryon-output"
    cache_dir = tmp_path / "wardrobe-cache"
    defaults = tmp_path / "defaults"
    output.mkdir(parents=True, exist_ok=True)
    cache_dir.mkdir(parents=True, exist_ok=True)
    defaults.mkdir(parents=True, exist_ok=True)

    (defaults / "pants_blank.jpg").write_bytes(b"pants")
    (defaults / "shirt_blank.jpg").write_bytes(b"shirt")
    (defaults / "shoes_blank.jpg").write_bytes(b"shoes")
    (defaults / "hat_blank.jpg").write_bytes(b"hat")

    monkeypatch.setattr(tryon_service, "TRYON_OUTPUT_DIR", output)
    monkeypatch.setattr(tryon_service, "WARDROBE_RUNTIME_CACHE_DIR", cache_dir)
    monkeypatch.setattr(tryon_service, "DEFAULT_PANTS_IMAGE", defaults / "pants_blank.jpg")
    monkeypatch.setattr(tryon_service, "DEFAULT_SHIRT_IMAGE", defaults / "shirt_blank.jpg")
    monkeypatch.setattr(tryon_service, "DEFAULT_SHOES_IMAGE", defaults / "shoes_blank.jpg")
    monkeypatch.setattr(tryon_service, "DEFAULT_HAT_IMAGE", defaults / "hat_blank.jpg")
    tryon_service._RUNTIME_CLOTHING_FILE_CACHE.clear()
    tryon_service._DEFAULT_IMAGE_CACHE.clear()
    tryon_service._LAST_CACHE_RESULT["cache_hit_image_ids"] = []
    tryon_service._LAST_CACHE_RESULT["cloudinary_fetch_image_ids"] = []
    tryon_service._LAST_CACHE_RESULT["cache_failed_image_ids"] = []
    return output, cache_dir, defaults


def _seed_item_with_images(db: Session, count: int = 3) -> list[ClothingImage]:
    item = ClothingItem(name="Item", category="top")
    db.add(item)
    db.commit()
    db.refresh(item)
    rows: list[ClothingImage] = []
    for i in range(count):
        row = ClothingImage(
            clothing_item_id=item.id,
            storage_provider="cloudinary",
            storage_key=f"k{i}",
            image_url=f"https://example.invalid/{i}.jpg",
        )
        db.add(row)
        rows.append(row)
    db.commit()
    for row in rows:
        db.refresh(row)
    return rows


def _seed_person(db: Session, path: Path) -> PersonImage:
    path.write_bytes(b"person")
    person = PersonImage(file_path=str(path), status="uploaded")
    db.add(person)
    db.commit()
    db.refresh(person)
    return person


@pytest.mark.asyncio
async def test_cache_protocol_dedupes_ids_and_skips_missing_db_rows(db_session: Session, isolated_tryon_dirs, monkeypatch: pytest.MonkeyPatch):
    _, cache_dir, _ = isolated_tryon_dirs
    rows = _seed_item_with_images(db_session, count=2)

    async def _fake_download(image_id: int, image_url: str) -> Path:
        p = cache_dir / f"clothing-{image_id}.jpg"
        p.write_bytes(image_url.encode("utf-8"))
        return p

    monkeypatch.setattr(tryon_service, "_download_clothing_to_runtime_cache", _fake_download)
    result = await tryon_service.cache_clothing_images(db_session, [rows[0].id, rows[0].id, 999999, rows[1].id])

    assert set(result["cached_image_ids"]) == {rows[0].id, rows[1].id}
    assert result["cache_hit_image_ids"] == []
    assert set(result["cloudinary_fetch_image_ids"]) == {rows[0].id, rows[1].id}
    assert result["cache_failed_image_ids"] == []


@pytest.mark.asyncio
async def test_cache_protocol_marks_hit_vs_fetch_vs_fail(db_session: Session, isolated_tryon_dirs, monkeypatch: pytest.MonkeyPatch):
    _, cache_dir, _ = isolated_tryon_dirs
    miss_row, hit_row, fail_row = _seed_item_with_images(db_session, count=3)

    hit_file = cache_dir / f"clothing-{hit_row.id}.jpg"
    hit_file.write_bytes(b"hit")
    tryon_service._RUNTIME_CLOTHING_FILE_CACHE[hit_row.id] = str(hit_file)

    async def _fake_download(image_id: int, image_url: str) -> Path:
        if image_id == fail_row.id:
            raise RuntimeError("boom")
        p = cache_dir / f"clothing-{image_id}.jpg"
        p.write_bytes(image_url.encode("utf-8"))
        return p

    monkeypatch.setattr(tryon_service, "_download_clothing_to_runtime_cache", _fake_download)
    result = await tryon_service.cache_clothing_images(db_session, [miss_row.id, hit_row.id, fail_row.id])

    assert set(result["cache_hit_image_ids"]) == {hit_row.id}
    assert set(result["cloudinary_fetch_image_ids"]) == {miss_row.id}
    assert set(result["cache_failed_image_ids"]) == {fail_row.id}


def test_cache_status_only_counts_files_still_on_disk(db_session: Session, isolated_tryon_dirs):
    _, cache_dir, _ = isolated_tryon_dirs
    a, b = _seed_item_with_images(db_session, count=2)

    good = cache_dir / f"clothing-{a.id}.jpg"
    good.write_bytes(b"x")
    stale = cache_dir / f"clothing-{b.id}.jpg"
    stale.write_bytes(b"y")
    stale.unlink()

    tryon_service._RUNTIME_CLOTHING_FILE_CACHE[a.id] = str(good)
    tryon_service._RUNTIME_CLOTHING_FILE_CACHE[b.id] = str(stale)
    status = tryon_service.get_cache_status()

    assert status["cached_count"] == 1
    assert status["cached_image_ids"] == [a.id]


@pytest.mark.asyncio
async def test_cache_status_reports_last_operation_metrics(db_session: Session, isolated_tryon_dirs, monkeypatch: pytest.MonkeyPatch):
    _, cache_dir, _ = isolated_tryon_dirs
    rows = _seed_item_with_images(db_session, count=3)

    hit_file = cache_dir / f"clothing-{rows[0].id}.jpg"
    hit_file.write_bytes(b"hit")
    tryon_service._RUNTIME_CLOTHING_FILE_CACHE[rows[0].id] = str(hit_file)

    async def _fake_download(image_id: int, image_url: str) -> Path:
        if image_id == rows[2].id:
            raise RuntimeError("fail")
        p = cache_dir / f"clothing-{image_id}.jpg"
        p.write_bytes(b"ok")
        return p

    monkeypatch.setattr(tryon_service, "_download_clothing_to_runtime_cache", _fake_download)
    await tryon_service.cache_clothing_images(db_session, [rows[0].id, rows[1].id, rows[2].id])

    status = tryon_service.get_cache_status()
    assert status["last_cache_hit_count"] == 1
    assert status["last_cloudinary_fetch_count"] == 1
    assert status["last_cache_failed_count"] == 1


@pytest.mark.asyncio
async def test_resolve_slot_prefers_runtime_local_file_over_url_cache(db_session: Session, isolated_tryon_dirs, monkeypatch: pytest.MonkeyPatch):
    _, cache_dir, _ = isolated_tryon_dirs
    row = _seed_item_with_images(db_session, count=1)[0]
    row.leonardo_init_url = "cached-remote-url"
    db_session.commit()

    local = cache_dir / f"clothing-{row.id}.jpg"
    local.write_bytes(b"local")
    tryon_service._RUNTIME_CLOTHING_FILE_CACHE[row.id] = str(local)

    calls: list[str] = []

    async def _fake_upload(path: str) -> str:
        calls.append(path)
        return "runtime-uploaded"

    monkeypatch.setattr(tryon_service.leonardo_service, "upload_init_image", _fake_upload)

    got = await tryon_service._resolve_slot_image_url(db_session, row, tryon_service.DEFAULT_PANTS_IMAGE, "pants")
    assert got == "runtime-uploaded"
    assert calls == [str(local)]


@pytest.mark.asyncio
async def test_resolve_slot_uses_leonardo_url_cache_when_runtime_missing(db_session: Session, isolated_tryon_dirs, monkeypatch: pytest.MonkeyPatch):
    row = _seed_item_with_images(db_session, count=1)[0]
    row.leonardo_init_url = "existing-url"
    db_session.commit()

    async def _should_not_run(*args, **kwargs):
        raise AssertionError("should not call upload_remote_image")

    monkeypatch.setattr(tryon_service.leonardo_service, "upload_remote_image", _should_not_run)
    got = await tryon_service._resolve_slot_image_url(db_session, row, tryon_service.DEFAULT_PANTS_IMAGE, "pants")
    assert got == "existing-url"


@pytest.mark.asyncio
async def test_resolve_slot_fetches_remote_and_persists_cache(db_session: Session, isolated_tryon_dirs, monkeypatch: pytest.MonkeyPatch):
    row = _seed_item_with_images(db_session, count=1)[0]

    async def _fake_remote(url: str) -> str:
        return f"leo::{url}"

    monkeypatch.setattr(tryon_service.leonardo_service, "upload_remote_image", _fake_remote)
    got = await tryon_service._resolve_slot_image_url(db_session, row, tryon_service.DEFAULT_PANTS_IMAGE, "pants")
    db_session.refresh(row)

    assert got.startswith("leo::")
    assert row.leonardo_init_url == got


@pytest.mark.asyncio
async def test_resolve_slot_default_missing_raises_http_500(db_session: Session, isolated_tryon_dirs):
    _, _, defaults = isolated_tryon_dirs
    missing = defaults / "missing.jpg"
    with pytest.raises(HTTPException) as exc:
        await tryon_service._resolve_slot_image_url(db_session, None, missing, "hat")
    assert exc.value.status_code == 500


@pytest.mark.asyncio
async def test_resolve_slot_default_upload_is_memoized(db_session: Session, isolated_tryon_dirs, monkeypatch: pytest.MonkeyPatch):
    calls: list[str] = []

    async def _fake_upload(path: str) -> str:
        calls.append(path)
        return f"url::{Path(path).name}"

    monkeypatch.setattr(tryon_service.leonardo_service, "upload_init_image", _fake_upload)
    one = await tryon_service._resolve_slot_image_url(db_session, None, tryon_service.DEFAULT_HAT_IMAGE, "hat")
    two = await tryon_service._resolve_slot_image_url(db_session, None, tryon_service.DEFAULT_HAT_IMAGE, "hat")

    assert one == two
    assert calls == [str(tryon_service.DEFAULT_HAT_IMAGE)]


@pytest.mark.asyncio
async def test_download_clothing_uses_jpg_suffix_when_source_has_no_extension(isolated_tryon_dirs, monkeypatch: pytest.MonkeyPatch):
    _, _, _ = isolated_tryon_dirs
    src = tryon_service.WARDROBE_RUNTIME_CACHE_DIR / "tempfile"
    src.write_bytes(b"abc")

    async def _fake_download(url: str) -> str:
        return str(src)

    monkeypatch.setattr(tryon_service.leonardo_service, "download_remote_image_to_tempfile", _fake_download)
    out = await tryon_service._download_clothing_to_runtime_cache(55, "https://example.invalid/noext")

    assert out.name.endswith(".jpg")
    assert out.read_bytes() == b"abc"


@pytest.mark.asyncio
async def test_download_clothing_cross_device_fallback_copies_and_unlinks_source(isolated_tryon_dirs, monkeypatch: pytest.MonkeyPatch):
    _, _, _ = isolated_tryon_dirs
    src = tryon_service.WARDROBE_RUNTIME_CACHE_DIR / "temp.webp"
    src.write_bytes(b"abc")

    async def _fake_download(url: str) -> str:
        return str(src)

    def _raise_exdev(_src, _dst):
        raise OSError(errno.EXDEV, "cross-device")

    monkeypatch.setattr(tryon_service.leonardo_service, "download_remote_image_to_tempfile", _fake_download)
    monkeypatch.setattr(tryon_service.os, "replace", _raise_exdev)
    out = await tryon_service._download_clothing_to_runtime_cache(6, "https://example.invalid/x.webp")

    assert out.exists()
    assert out.read_bytes() == b"abc"
    assert not src.exists()


@pytest.mark.asyncio
async def test_download_clothing_non_exdev_replace_error_is_raised(isolated_tryon_dirs, monkeypatch: pytest.MonkeyPatch):
    _, _, _ = isolated_tryon_dirs
    src = tryon_service.WARDROBE_RUNTIME_CACHE_DIR / "temp.webp"
    src.write_bytes(b"abc")

    async def _fake_download(url: str) -> str:
        return str(src)

    def _raise_other(_src, _dst):
        raise OSError(errno.EACCES, "denied")

    monkeypatch.setattr(tryon_service.leonardo_service, "download_remote_image_to_tempfile", _fake_download)
    monkeypatch.setattr(tryon_service.os, "replace", _raise_other)

    with pytest.raises(OSError):
        await tryon_service._download_clothing_to_runtime_cache(7, "https://example.invalid/y.webp")


def test_get_generation_local_image_path_returns_latest_file(isolated_tryon_dirs):
    output, _, _ = isolated_tryon_dirs
    old = output / "generation-12-old.jpg"
    new = output / "generation-12-new.jpg"
    old.write_bytes(b"old")
    new.write_bytes(b"new")
    old.touch()
    new.touch()

    got = tryon_service.get_generation_local_image_path(12)
    assert got == new.resolve()


def test_get_generation_local_image_path_404_when_none(isolated_tryon_dirs):
    with pytest.raises(HTTPException) as exc:
        tryon_service.get_generation_local_image_path(333)
    assert exc.value.status_code == 404


def test_create_generation_404_when_person_missing(db_session: Session):
    payload = TryOnRequest(person_image_id=999)
    with pytest.raises(HTTPException) as exc:
        tryon_service.create_generation(db_session, payload)
    assert exc.value.status_code == 404


def test_create_generation_404_when_person_file_missing(db_session: Session, tmp_path: Path):
    person = PersonImage(file_path=str(tmp_path / "missing.jpg"), status="uploaded")
    db_session.add(person)
    db_session.commit()
    db_session.refresh(person)

    with pytest.raises(HTTPException) as exc:
        tryon_service.create_generation(db_session, TryOnRequest(person_image_id=person.id))
    assert exc.value.status_code == 404


def test_create_generation_404_when_slot_image_missing(db_session: Session, tmp_path: Path):
    person = _seed_person(db_session, tmp_path / "person.jpg")
    with pytest.raises(HTTPException) as exc:
        tryon_service.create_generation(db_session, TryOnRequest(person_image_id=person.id, shirt_image_id=404404))
    assert exc.value.status_code == 404


def test_create_generation_success_with_all_slots(db_session: Session, tmp_path: Path):
    person = _seed_person(db_session, tmp_path / "person.jpg")
    pants, shirt, shoes, hat = _seed_item_with_images(db_session, count=4)

    row = tryon_service.create_generation(
        db_session,
        TryOnRequest(
            person_image_id=person.id,
            pants_image_id=pants.id,
            shirt_image_id=shirt.id,
            shoes_image_id=shoes.id,
            hat_image_id=hat.id,
        ),
    )
    assert row.status == "processing"
    assert row.person_image_id == person.id


@pytest.mark.asyncio
async def test_process_generation_success_intersects_cache_and_defaults(db_session: Session, isolated_tryon_dirs, monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    person = _seed_person(db_session, tmp_path / "person.jpg")
    pants, shirt, shoes = _seed_item_with_images(db_session, count=3)
    shirt.leonardo_init_url = "shirt-cached-url"
    db_session.commit()

    local = tryon_service.WARDROBE_RUNTIME_CACHE_DIR / f"clothing-{pants.id}.jpg"
    local.write_bytes(b"pants-local")
    tryon_service._RUNTIME_CLOTHING_FILE_CACHE[pants.id] = str(local)

    generation = tryon_service.create_generation(
        db_session,
        TryOnRequest(person_image_id=person.id, pants_image_id=pants.id, shirt_image_id=shirt.id, shoes_image_id=shoes.id),
    )

    node_inputs_seen: list[list[dict]] = []

    async def _upload_init(path: str) -> str:
        return f"init::{Path(path).name}"

    async def _upload_remote(url: str) -> str:
        return f"remote::{url.split('/')[-1]}"

    async def _execute_blueprint(node_inputs: list[dict]) -> str:
        node_inputs_seen.append(node_inputs)
        return "exec-1"

    async def _wait_generation_id(execution_id: str) -> str:
        return "gen-1"

    async def _generated_url(gen_id: str) -> str:
        return "https://example.invalid/out.png"

    async def _persist(image_url: str, generation_id: int) -> Path:
        p = tryon_service.TRYON_OUTPUT_DIR / f"generation-{generation_id}-x.png"
        p.write_bytes(b"image")
        return p

    monkeypatch.setattr(tryon_service.leonardo_service, "upload_init_image", _upload_init)
    monkeypatch.setattr(tryon_service.leonardo_service, "upload_remote_image", _upload_remote)
    monkeypatch.setattr(tryon_service.leonardo_service, "execute_blueprint", _execute_blueprint)
    monkeypatch.setattr(tryon_service.leonardo_service, "wait_for_generation_id", _wait_generation_id)
    monkeypatch.setattr(tryon_service.leonardo_service, "get_generated_image_url", _generated_url)
    monkeypatch.setattr(tryon_service, "_persist_generated_image_local", _persist)
    monkeypatch.setattr(
        tryon_service.cloud_storage_service,
        "upload_generated_image",
        lambda *_args, **_kwargs: {"storage_provider": "cloudinary", "storage_key": "abc"},
    )

    out = await tryon_service.process_generation(db_session, generation.id)

    assert out.status == "completed"
    assert out.result_image_url == f"/api/tryon/public/generations/{generation.id}/image"
    assert len(node_inputs_seen) == 1
    values = [entry["value"] for entry in node_inputs_seen[0]]
    assert any(v.startswith("init::clothing-") for v in values)
    assert "shirt-cached-url" in values
    assert any(v.startswith("remote::") for v in values)
    assert any(v.startswith("init::hat_blank") for v in values)


@pytest.mark.asyncio
async def test_process_generation_converts_unexpected_error_to_http_500(db_session: Session, isolated_tryon_dirs, monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    person = _seed_person(db_session, tmp_path / "person.jpg")
    generation = tryon_service.create_generation(db_session, TryOnRequest(person_image_id=person.id))

    async def _boom(_path: str):
        raise RuntimeError("upload failed")

    monkeypatch.setattr(tryon_service.leonardo_service, "upload_init_image", _boom)

    with pytest.raises(HTTPException) as exc:
        await tryon_service.process_generation(db_session, generation.id)

    db_session.refresh(generation)
    assert exc.value.status_code == 500
    assert generation.status == "failed"
    assert "upload failed" in (generation.error_message or "")


@pytest.mark.asyncio
async def test_process_generation_http_exception_is_re_raised_and_persisted_failed(db_session: Session, isolated_tryon_dirs, tmp_path: Path):
    person = _seed_person(db_session, tmp_path / "person.jpg")
    generation = tryon_service.create_generation(db_session, TryOnRequest(person_image_id=person.id))

    tryon_service.DEFAULT_HAT_IMAGE.unlink(missing_ok=True)

    with pytest.raises(HTTPException) as exc:
        await tryon_service.process_generation(db_session, generation.id)

    db_session.refresh(generation)
    assert exc.value.status_code == 500
    assert generation.status == "failed"


def test_cache_clothing_endpoint_and_status_intersection(db_session: Session, client: TestClient, isolated_tryon_dirs, monkeypatch: pytest.MonkeyPatch):
    _, cache_dir, _ = isolated_tryon_dirs
    miss_row, hit_row = _seed_item_with_images(db_session, count=2)

    hit_file = cache_dir / f"clothing-{hit_row.id}.jpg"
    hit_file.write_bytes(b"hit")
    tryon_service._RUNTIME_CLOTHING_FILE_CACHE[hit_row.id] = str(hit_file)

    async def _fake_download(image_id: int, image_url: str) -> Path:
        p = cache_dir / f"clothing-{image_id}.jpg"
        p.write_bytes(b"download")
        return p

    monkeypatch.setattr(tryon_service, "_download_clothing_to_runtime_cache", _fake_download)

    cache_resp = client.post("/api/tryon/cache-clothing", json={"image_ids": [miss_row.id, hit_row.id]})
    assert cache_resp.status_code == 200

    status_resp = client.get("/api/tryon/cache-status")
    assert status_resp.status_code == 200
    status = status_resp.json()
    assert status["cached_count"] == 2
    assert status["last_cache_hit_count"] == 1
    assert status["last_cloudinary_fetch_count"] == 1


def test_get_generation_endpoint_404(client: TestClient):
    resp = client.get("/api/tryon/generations/99999")
    assert resp.status_code == 404


def test_public_generation_image_endpoint_404(client: TestClient, isolated_tryon_dirs):
    resp = client.get("/api/tryon/public/generations/11/image")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_process_wrapper_swallows_failures(monkeypatch: pytest.MonkeyPatch):
    class _FakeSession:
        def close(self):
            return None

    async def _fake_process(*_args, **_kwargs):
        raise RuntimeError("failed")

    async def _fake_broadcast(_payload: dict):
        raise AssertionError("broadcast should not be called")

    monkeypatch.setattr(tryon_api, "SessionLocal", lambda: _FakeSession())
    monkeypatch.setattr(tryon_api.tryon_service, "process_generation", _fake_process)
    monkeypatch.setattr(tryon_api.control_registry, "broadcast", _fake_broadcast)

    await tryon_api._process_tryon_generation(9)


def test_get_generation_image_serves_bytes(db_session: Session, client: TestClient, isolated_tryon_dirs, tmp_path: Path):
    person = _seed_person(db_session, tmp_path / "person.jpg")
    generation = TryOnGeneration(person_image_id=person.id, status="completed")
    db_session.add(generation)
    db_session.commit()
    db_session.refresh(generation)

    local_file = tryon_service.TRYON_OUTPUT_DIR / f"generation-{generation.id}-abc.jpg"
    local_file.write_bytes(b"img")

    resp = client.get(f"/api/tryon/public/generations/{generation.id}/image")
    assert resp.status_code == 200
    assert resp.content == b"img"


@pytest.mark.asyncio
async def test_generation_retention_deletes_stale_cloudinary_rows(db_session: Session, isolated_tryon_dirs, monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    person = _seed_person(db_session, tmp_path / "person.jpg")
    deleted: list[str] = []

    monkeypatch.setattr(tryon_service.cloud_storage_service, "delete_image", lambda key: deleted.append(key))

    rows: list[TryOnGeneration] = []
    for i in range(3):
        row = TryOnGeneration(
            person_image_id=person.id,
            status="completed",
            result_storage_provider="cloudinary",
            result_storage_key=f"k{i}",
            result_image_url=f"/api/tryon/public/generations/{i}/image",
        )
        db_session.add(row)
        db_session.commit()
        db_session.refresh(row)
        img = tryon_service.TRYON_OUTPUT_DIR / f"generation-{row.id}-{i}.jpg"
        img.write_bytes(b"x")
        rows.append(row)

    tryon_service._enforce_generation_retention(db_session, keep_latest=1)

    remaining_ids = [r.id for r in db_session.query(TryOnGeneration).all()]
    assert len(remaining_ids) == 1
    assert len(deleted) == 2
