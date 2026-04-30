import cloudinary
import cloudinary.uploader

# Reads CLOUDINARY_URL from environment.
# secure=True ensures returned asset URLs prefer HTTPS.
cloudinary.config(secure=True)


def upload_clothing_image(file_path: str, public_id: str | None = None) -> dict:
    """
    Upload a clothing image file to Cloudinary and return normalized metadata
    for the rest of the backend.
    """
    result = cloudinary.uploader.upload(
        file_path,
        folder="smart-mirror/clothing",
        public_id=public_id,
        resource_type="image",
    )

    return {
        "storage_provider": "cloudinary",
        "storage_key": result["public_id"],
        "image_url": result["secure_url"],
    }

def upload_generated_image(source: str, public_id: str | None = None) -> dict:
    result = cloudinary.uploader.upload(
        source,
        folder="smart-mirror/tryon-results",
        public_id=public_id,
        resource_type="image",
    )

    return {
        "storage_provider": "cloudinary",
        "storage_key": result["public_id"],
        "image_url": result["secure_url"],
    }


def delete_image(public_id: str) -> None:
    cloudinary.uploader.destroy(public_id, resource_type="image", invalidate=True)
