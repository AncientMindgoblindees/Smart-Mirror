"""
TheNewsAPI.com client - https://www.thenewsapi.com/documentation
Uses /v1/news/top, which is available on all plans.
"""

from __future__ import annotations

import asyncio
import time
from typing import Any, Dict, List, Optional

import httpx

from backend.schemas.news import NewsFeedOut, NewsHeadlineOut

THENEWSAPI_BASE = "https://api.thenewsapi.com/v1"

_cache_lock = asyncio.Lock()
_cache: dict[str, tuple[NewsFeedOut, float]] = {}
CACHE_TTL_SEC = 30 * 60.0


def _category_label(categories: Any) -> str:
    if isinstance(categories, list):
        for item in categories:
            if isinstance(item, str) and item.strip():
                value = item.strip()
                return "Technology" if value.lower() == "tech" else value.title()
    return "General"


def _article_id(article: Dict[str, Any], index: int) -> str:
    raw = article.get("uuid") or article.get("url") or f"news-{index}"
    return str(raw)


def _summary(article: Dict[str, Any]) -> Optional[str]:
    for field in ("description", "snippet"):
        value = article.get(field)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _parse_feed(payload: Dict[str, Any], limit: int) -> tuple[NewsFeedOut | None, str | None]:
    data = payload.get("data")
    if not isinstance(data, list):
        return None, "invalid_response: missing data list"

    headlines: List[NewsHeadlineOut] = []
    for index, item in enumerate(data[:limit]):
        if not isinstance(item, dict):
            continue
        title = str(item.get("title") or "").strip()
        if not title:
            continue
        headlines.append(
            NewsHeadlineOut(
                id=_article_id(item, index),
                title=title,
                source=str(item.get("source") or "").strip() or "News",
                category=_category_label(item.get("categories")),
                published_at=str(item.get("published_at") or "").strip(),
                url=str(item.get("url") or "").strip(),
                summary=_summary(item),
                image_url=str(item.get("image_url") or "").strip() or None,
            )
        )

    return NewsFeedOut(configured=True, live=True, headlines=headlines), None


async def fetch_news_feed(
    api_key: str,
    *,
    limit: int,
    locale: str,
    language: str,
    categories: str,
    search: str,
) -> tuple[Optional[NewsFeedOut], Optional[str]]:
    params: dict[str, str | int] = {
        "api_token": api_key,
        "limit": limit,
        "page": 1,
    }
    if locale:
        params["locale"] = locale
    if language:
        params["language"] = language
    if categories:
        params["categories"] = categories
    if search:
        params["search"] = search

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get(f"{THENEWSAPI_BASE}/news/top", params=params)
    except httpx.RequestError as e:
        return None, f"network: {e}"

    if r.status_code != 200:
        try:
            body = r.json()
            msg = body.get("error", {}).get("message") or body.get("message") or r.text
        except Exception:
            msg = r.text
        return None, f"http_{r.status_code}: {msg}"

    try:
        data = r.json()
    except Exception as e:
        return None, f"json: {e}"

    return _parse_feed(data, limit)


def _clean_csv(value: str, fallback: str = "") -> str:
    parts = [part.strip().lower() for part in value.split(",") if part.strip()]
    return ",".join(parts) or fallback


def _cache_key(limit: int, locale: str, language: str, categories: str, search: str) -> str:
    return "|".join(
        [
            str(limit),
            _clean_csv(locale, "us"),
            _clean_csv(language, "en"),
            _clean_csv(categories),
            search.strip().lower(),
        ]
    )


async def get_news_feed(
    api_key: Optional[str],
    *,
    limit: int = 5,
    locale: str = "us",
    language: str = "en",
    categories: str = "",
    search: str = "",
) -> NewsFeedOut:
    if not api_key or not api_key.strip():
        return NewsFeedOut(
            configured=False,
            live=False,
            error="Set environment variable THENEWSAPI_KEY (see README).",
        )

    resolved_limit = max(1, min(10, int(limit or 5)))
    resolved_locale = _clean_csv(locale, "us")
    resolved_language = _clean_csv(language, "en")
    resolved_categories = _clean_csv(categories)
    resolved_search = search.strip()
    key = _cache_key(
        resolved_limit,
        resolved_locale,
        resolved_language,
        resolved_categories,
        resolved_search,
    )

    async with _cache_lock:
        now = time.monotonic()
        hit = _cache.get(key)
        if hit is not None and hit[0].live and (now - hit[1]) < CACHE_TTL_SEC:
            return hit[0]

    feed, err = await fetch_news_feed(
        api_key.strip(),
        limit=resolved_limit,
        locale=resolved_locale,
        language=resolved_language,
        categories=resolved_categories,
        search=resolved_search,
    )

    async with _cache_lock:
        if feed is not None:
            _cache[key] = (feed, time.monotonic())
            return feed

        return NewsFeedOut(
            configured=True,
            live=False,
            error=err or "unknown",
        )
