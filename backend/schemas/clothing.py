from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict

class ClothingItemCreate(BaseModel):
    name: str
    category: str
    color: Optional[str] = None
    season: Optional[str] = None
    notes: Optional[str] = None

class ClothingItemUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    color: Optional[str] = None
    season: Optional[str] = None
    notes: Optional[str] = None

class ClothingItemRead(BaseModel):
    id: int
    name: str
    category: str
    color: Optional[str] = None
    season: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    images: Optional[List["ClothingImageRead"]] = None

    model_config = ConfigDict(from_attributes=True)

class ClothingImageRead(BaseModel):
    id: int
    clothing_item_id: int
    storage_provider: str
    storage_key: str
    image_url: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


ClothingItemRead.model_rebuild()