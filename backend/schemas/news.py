from typing import List, Optional

from pydantic import BaseModel, Field


class NewsHeadlineOut(BaseModel):
    id: str
    title: str
    source: str
    category: str
    published_at: str
    url: str
    summary: Optional[str] = None
    image_url: Optional[str] = None


class NewsFeedOut(BaseModel):
    configured: bool = Field(
        ...,
        description="False when THENEWSAPI_KEY is not set",
    )
    live: bool = Field(
        False,
        description="True when data was fetched successfully from TheNewsAPI.com",
    )
    headlines: List[NewsHeadlineOut] = Field(default_factory=list)
    error: Optional[str] = None
