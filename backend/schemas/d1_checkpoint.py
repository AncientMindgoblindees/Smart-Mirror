from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class D1SyncCheckpointOut(BaseModel):
    table_name: str
    last_pull_at: datetime
    last_remote_cursor: Optional[str] = None
    last_remote_cursor_id: Optional[int] = None
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class D1SyncCheckpointCreate(BaseModel):
    table_name: str
    last_pull_at: Optional[datetime] = None
    last_remote_cursor: Optional[str] = None
    last_remote_cursor_id: Optional[int] = None


class D1SyncCheckpointUpdate(BaseModel):
    last_pull_at: Optional[datetime] = None
    last_remote_cursor: Optional[str] = None
    last_remote_cursor_id: Optional[int] = None
