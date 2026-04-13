from typing import List, Optional

from pydantic import BaseModel, Field


class OutfitGenerateRequest(BaseModel):
    clothing_image_ids: List[int] = Field(
        ...,
        min_length=1,
        description="Clothing image row IDs (Cloudinary-backed) to reference for try-on",
    )
    prompt: Optional[str] = Field(
        None,
        description="Optional extra instructions appended to the default try-on prompt",
    )


class OutfitGenerateResponse(BaseModel):
    status: str
    generation_id: str
    image_url: str
