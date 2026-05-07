import os

from fastapi import APIRouter, Query

from backend.schemas.news import NewsFeedOut
from backend.services.news_api import get_news_feed

router = APIRouter(prefix="/news", tags=["news"])


def _api_key() -> str | None:
    return (
        os.getenv("THENEWSAPI_KEY")
        or os.getenv("THENEWSAPI_API_KEY")
        or os.getenv("THE_NEWS_API_KEY")
    )


@router.get("/", response_model=NewsFeedOut, summary="Top stories from TheNewsAPI.com (proxied)")
async def read_news(
    limit: int = Query(
        5,
        ge=1,
        le=10,
        description="Number of top stories to return.",
    ),
    locale: str = Query(
        "us",
        description="Comma-separated country codes, for example 'us' or 'us,ca'.",
    ),
    language: str = Query(
        "en",
        description="Comma-separated language codes, for example 'en'.",
    ),
    categories: str = Query(
        "",
        description="Comma-separated categories: general, science, sports, business, health, entertainment, tech, politics, food, travel.",
    ),
    search: str = Query(
        "",
        description="Optional search query supported by TheNewsAPI top stories endpoint.",
    ),
) -> NewsFeedOut:
    """
    Proxies TheNewsAPI.com using `THENEWSAPI_KEY`.
    Widget options are persisted in `config_json` by the companion app.
    """
    return await get_news_feed(
        _api_key(),
        limit=limit,
        locale=locale,
        language=language,
        categories=categories,
        search=search,
    )
