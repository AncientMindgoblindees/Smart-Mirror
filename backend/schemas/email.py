from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel


class EmailMessageOut(BaseModel):
    source: str  # "google"
    sender: str
    subject: str
    received_at: Optional[str] = None
    unread: bool = True
    high_priority: bool = False


class EmailMessagesResponse(BaseModel):
    messages: List[EmailMessageOut]
    providers: List[str]
