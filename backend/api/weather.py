import os
from typing import Literal

from fastapi import APIRouter, Query

from backend.services.weather_api import get_weather_snapshot
from backend.schemas.weather import WeatherSnapshotOut

router = APIRouter(prefix="/weather", tags=["weather"])


def _location_q() -> str:
    return os.getenv("WEATHERAPI_Q", "San Francisco").strip() or "San Francisco"


def _api_key() -> str | None:
    return os.getenv("WEATHERAPI_KEY") or os.getenv("WEATHER_API_KEY")


@router.get("/", response_model=WeatherSnapshotOut, summary="Weather from WeatherAPI.com (proxied)")
async def read_weather(
    q: str | None = Query(
        None,
        description="Location (city, lat,lon, zip). When omitted, uses WEATHERAPI_Q from the server environment.",
    ),
    units: Literal["metric", "imperial"] = Query(
        "metric",
        description="metric (°C, km/h) or imperial (°F, mph)",
    ),
) -> WeatherSnapshotOut:
    """
    Proxies [WeatherAPI.com](https://www.weatherapi.com/) using `WEATHERAPI_KEY`.
    `q` and `units` should match the companion weather widget (persisted in `config_json`).
    """
    raw = (q or "").strip()
    q_resolved = raw or _location_q() or "San Francisco"
    return await get_weather_snapshot(_api_key(), q_resolved, units)
