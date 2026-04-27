from pathlib import Path
from uuid import uuid4

from backend.services import cloud_storage_service


def test_upload_clothing_image_normalizes_cloudinary_response(monkeypatch):
    tmp_dir = (Path(__file__).resolve().parent / ".artifacts" / f"cloud-storage-{uuid4().hex}").resolve()
    tmp_dir.mkdir(parents=True, exist_ok=True)
    upload_path = tmp_dir / "shirt.png"
    upload_path.write_bytes(b"fake-image")

    def fake_upload(file_path, **kwargs):
        assert file_path == str(upload_path)
        assert kwargs["folder"] == "smart-mirror/clothing"
        assert kwargs["public_id"] == "shirt-1"
        assert kwargs["resource_type"] == "image"
        return {
            "public_id": "smart-mirror/clothing/shirt-1",
            "secure_url": "https://cdn.example/shirt-1.png",
        }

    monkeypatch.setattr(cloud_storage_service.cloudinary.uploader, "upload", fake_upload)

    try:
        result = cloud_storage_service.upload_clothing_image(str(upload_path), public_id="shirt-1")

        assert result == {
            "storage_provider": "cloudinary",
            "storage_key": "smart-mirror/clothing/shirt-1",
            "image_url": "https://cdn.example/shirt-1.png",
        }
    finally:
        upload_path.unlink(missing_ok=True)
        tmp_dir.rmdir()
