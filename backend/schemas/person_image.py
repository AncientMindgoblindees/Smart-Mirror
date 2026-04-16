from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class PersonImageRead(BaseModel):
    id: int
    file_path: str
    status: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PersonImageUpdate(BaseModel):
    status: Optional[str] = None