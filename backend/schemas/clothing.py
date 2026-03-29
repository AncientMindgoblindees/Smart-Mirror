from datetime import datetime
from typing import Optional
from pydantic import BaseModel

class ClothingItemCreate(BaseModel):
    name: str
    category: str
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

    class Config:
        orm_mode = True
