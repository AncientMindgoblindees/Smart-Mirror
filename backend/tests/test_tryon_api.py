from pathlib import Path

from backend.api import tryon
from backend.database.models import ClothingImage, ClothingItem, PersonImage


def test_person_image_upload_list_fetch_patch_and_delete(client, isolated_storage):
    upload_response = client.post(
        "/api/tryon/person-image",
        files={"file": ("portrait.jpg", b"person-image", "image/jpeg")},
    )

    assert upload_response.status_code == 201
    created = upload_response.json()
    assert created["status"] == "uploaded"
    stored_path = Path(created["file_path"])
    assert stored_path.exists()
    assert stored_path == isolated_storage["latest_person_image_path"]

    list_response = client.get("/api/tryon/person-image")
    assert list_response.status_code == 200
    assert len(list_response.json()) == 1

    latest_response = client.get("/api/tryon/person-image/latest")
    assert latest_response.status_code == 200
    assert latest_response.content == b"person-image"

    by_id_response = client.get(f"/api/tryon/person-image/{created['id']}")
    assert by_id_response.status_code == 200
    assert by_id_response.content == b"person-image"

    patch_response = client.patch(
        f"/api/tryon/person-image/{created['id']}",
        json={"status": "approved"},
    )
    assert patch_response.status_code == 200
    assert patch_response.json()["status"] == "approved"

    delete_response = client.delete(f"/api/tryon/person-image/{created['id']}")
    assert delete_response.status_code == 200
    assert delete_response.json()["status"] == "ok"
    assert not stored_path.exists()


def test_person_image_upload_rejects_invalid_extension(client):
    response = client.post(
        "/api/tryon/person-image",
        files={"file": ("portrait.gif", b"gif-bytes", "image/gif")},
    )

    assert response.status_code == 400
    assert "Unsupported file type" in response.json()["detail"]


def test_person_image_latest_returns_404_when_no_images_exist(client):
    response = client.get("/api/tryon/person-image/latest")

    assert response.status_code == 404
    assert response.json()["detail"] == "No person image available"


def test_outfit_generate_returns_mocked_local_url(
    client,
    db_session,
    isolated_storage,
    monkeypatch,
):
    clothing_item = ClothingItem(name="Rain Jacket", category="shirt")
    db_session.add(clothing_item)
    db_session.commit()
    db_session.refresh(clothing_item)

    clothing_image = ClothingImage(
        clothing_item_id=clothing_item.id,
        storage_provider="cloudinary",
        storage_key="rain-jacket-1",
        image_url="https://cdn.example/rain-jacket.png",
    )
    db_session.add(clothing_image)

    person_path = isolated_storage["latest_person_image_path"]
    person_path.write_bytes(b"portrait")
    person_row = PersonImage(file_path=str(person_path), status="uploaded")
    db_session.add(person_row)
    db_session.commit()
    db_session.refresh(clothing_image)

    broadcast_payloads = []

    def fake_run_outfit_generation(db, clothing_image_ids, extra_prompt):
        assert clothing_image_ids == [clothing_image.id]
        assert extra_prompt == "studio lighting"
        return ("gen-123", "https://remote.example/tryon.png")

    def fake_store_remote_result(generation_id, remote_url):
        assert generation_id == "gen-123"
        assert remote_url == "https://remote.example/tryon.png"
        output_path = isolated_storage["tryon_dir"] / "tryon_gen-123.png"
        output_path.write_bytes(b"generated")
        return output_path

    async def fake_broadcast(payload):
        broadcast_payloads.append(payload)

    monkeypatch.setattr(tryon.config, "LEONARDO_API_KEY", "test-leonardo-key")
    monkeypatch.setattr(tryon.tryon_outfit_service, "run_outfit_generation", fake_run_outfit_generation)
    monkeypatch.setattr(tryon.tryon_result_service, "store_remote_result", fake_store_remote_result)
    monkeypatch.setattr(tryon.tryon_result_service, "prune_generated_results", lambda: None)
    monkeypatch.setattr(tryon.control_registry, "broadcast", fake_broadcast)

    response = client.post(
        "/api/tryon/outfit-generate",
        json={
            "clothing_image_ids": [clothing_image.id],
            "prompt": "studio lighting",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "complete"
    assert payload["generation_id"] == "gen-123"
    assert payload["image_url"].endswith("/api/tryon/generated/tryon_gen-123.png")
    assert broadcast_payloads[0]["type"] == "TRYON_RESULT"


def test_outfit_generate_requires_clothing_images(client):
    response = client.post(
        "/api/tryon/outfit-generate",
        json={"clothing_image_ids": []},
    )

    assert response.status_code == 422


def test_outfit_generate_returns_503_when_leonardo_is_not_configured(client):
    from backend.api import tryon

    tryon.config.LEONARDO_API_KEY = ""
    response = client.post(
        "/api/tryon/outfit-generate",
        json={"clothing_image_ids": [1]},
    )

    assert response.status_code == 503
    assert "Leonardo API not configured" in response.json()["detail"]
