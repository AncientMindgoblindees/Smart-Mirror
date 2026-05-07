from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class TryOnRequest(BaseModel):
    person_image_id: int
    pants_image_id: int | None = None
    shirt_image_id: int | None = None
    shoes_image_id: int | None = None
    hat_image_id: int | None = None


class TryOnGenerationRead(BaseModel):
    id: int

    person_image_id: int
    pants_image_id: int | None = None
    shirt_image_id: int | None = None
    shoes_image_id: int | None = None
    hat_image_id: int | None = None

    status: str
    leonardo_execution_id: str | None = None
    leonardo_generation_id: str | None = None

    result_storage_provider: str | None = None
    result_storage_key: str | None = None
    result_image_url: str | None = None

    error_message: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TryOnCacheRequest(BaseModel):
    image_ids: list[int] = Field(default_factory=list)


class TryOnCacheResponse(BaseModel):
    cached_image_ids: list[int]
    cache_hit_image_ids: list[int] = Field(default_factory=list)
    cloudinary_fetch_image_ids: list[int] = Field(default_factory=list)
    cache_failed_image_ids: list[int] = Field(default_factory=list)


class TryOnCacheStatusResponse(BaseModel):
    cached_count: int
    cached_image_ids: list[int] = Field(default_factory=list)
    last_cache_hit_count: int = 0
    last_cloudinary_fetch_count: int = 0
    last_cache_failed_count: int = 0
    last_cache_hit_image_ids: list[int] = Field(default_factory=list)
    last_cloudinary_fetch_image_ids: list[int] = Field(default_factory=list)
    last_cache_failed_image_ids: list[int] = Field(default_factory=list)
