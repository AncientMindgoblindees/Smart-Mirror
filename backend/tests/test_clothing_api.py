from backend.database.models import ClothingImage, ClothingItem


def test_clothing_item_crud_round_trip(client):
    create_response = client.post(
        "/api/clothing/",
        json={
            "name": "Oxford Shirt",
            "category": "shirt",
            "color": "blue",
            "season": "spring",
            "notes": "Workwear",
        },
    )

    assert create_response.status_code == 201
    created = create_response.json()
    assert created["name"] == "Oxford Shirt"
    assert created["images"] == []

    list_response = client.get("/api/clothing/")
    assert list_response.status_code == 200
    assert len(list_response.json()) == 1

    item_id = created["id"]
    get_response = client.get(f"/api/clothing/{item_id}")
    assert get_response.status_code == 200
    assert get_response.json()["category"] == "shirt"

    update_response = client.put(
        f"/api/clothing/{item_id}",
        json={"notes": "Updated note", "color": "navy"},
    )
    assert update_response.status_code == 200
    assert update_response.json()["notes"] == "Updated note"
    assert update_response.json()["color"] == "navy"

    delete_response = client.delete(f"/api/clothing/{item_id}")
    assert delete_response.status_code == 204

    missing_response = client.get(f"/api/clothing/{item_id}")
    assert missing_response.status_code == 404


def test_clothing_create_requires_required_fields(client):
    response = client.post("/api/clothing/", json={"category": "shirt"})

    assert response.status_code == 422


def test_upload_clothing_image_uses_mocked_cloudinary_metadata(client, db_session, monkeypatch):
    item = ClothingItem(name="Jeans", category="pants")
    db_session.add(item)
    db_session.commit()
    db_session.refresh(item)

    def fake_upload(file_path, public_id=None):
        assert public_id
        return {
            "storage_provider": "cloudinary",
            "storage_key": "mock-public-id",
            "image_url": "https://cdn.example/mock-image.png",
        }

    monkeypatch.setattr(
        "backend.services.clothing_service.cloud_storage_service.upload_clothing_image",
        fake_upload,
    )

    response = client.post(
        f"/api/clothing/{item.id}/images",
        files={"file": ("jeans.png", b"image-bytes", "image/png")},
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["storage_provider"] == "cloudinary"
    assert payload["storage_key"] == "mock-public-id"
    assert payload["image_url"] == "https://cdn.example/mock-image.png"

    list_response = client.get(f"/api/clothing/{item.id}/images")
    assert list_response.status_code == 200
    assert len(list_response.json()) == 1


def test_upload_clothing_image_rejects_invalid_file_type(client, db_session):
    item = ClothingItem(name="Belt", category="accessories")
    db_session.add(item)
    db_session.commit()
    db_session.refresh(item)

    response = client.post(
        f"/api/clothing/{item.id}/images",
        files={"file": ("belt.txt", b"not-an-image", "text/plain")},
    )

    assert response.status_code == 400
    assert "Unsupported file type" in response.json()["detail"]


def test_upload_clothing_image_returns_404_for_missing_item(client):
    response = client.post(
        "/api/clothing/999/images",
        files={"file": ("shirt.png", b"image-bytes", "image/png")},
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Clothing item not found"


def test_delete_clothing_image_removes_row(client, db_session):
    item = ClothingItem(name="Cap", category="accessories")
    db_session.add(item)
    db_session.commit()
    db_session.refresh(item)

    image = ClothingImage(
        clothing_item_id=item.id,
        storage_provider="cloudinary",
        storage_key="cap-1",
        image_url="https://cdn.example/cap.png",
    )
    db_session.add(image)
    db_session.commit()
    db_session.refresh(image)
    image_id = image.id

    response = client.delete(f"/api/clothing/{item.id}/images/{image_id}")

    assert response.status_code == 204
    db_session.expire_all()
    assert db_session.get(ClothingImage, image_id) is None
