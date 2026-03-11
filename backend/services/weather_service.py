import asyncio
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional, Tuple

import httpx

from backend.config import WeatherConfig, get_weather_config
from backend.schemas.weather import (
    OutdoorWeatherOut,
    WeatherCacheMetaOut,
    WeatherCurrentOut,
    WeatherLocationOut,
)


_WEATHER_URL = "https://api.open-meteo.com/v1/forecast"
_CACHE: Dict[str, Dict[str, Any]] = {}
_CACHE_LOCK = asyncio.Lock()


async def get_current_weather() -> WeatherCurrentOut:
    config = get_weather_config()

    if config.latitude is None or config.longitude is None:
        return _build_response(
            config=config,
            status="unavailable",
            cache_status="miss",
            outdoor=None,
            fetched_at=None,
            expires_at=None,
            error_code="weather_not_configured",
            error_message="Set WEATHER_LAT and WEATHER_LON to enable weather.",
        )

    cache_key = _build_cache_key(config)
    now = datetime.now(timezone.utc)

    async with _CACHE_LOCK:
        entry = _CACHE.get(cache_key)
        if entry and now < entry["expires_at"]:
            return _build_response(
                config=config,
                status="ok",
                cache_status="fresh",
                outdoor=entry["outdoor"],
                fetched_at=entry["fetched_at"],
                expires_at=entry["expires_at"],
            )

        try:
            outdoor = await _fetch_open_meteo(config)
        except Exception as exc:
            if entry and _is_stale_usable(entry["fetched_at"], now, config):
                return _build_response(
                    config=config,
                    status="stale",
                    cache_status="stale",
                    outdoor=entry["outdoor"],
                    fetched_at=entry["fetched_at"],
                    expires_at=entry["expires_at"],
                    error_code="weather_upstream_unavailable",
                    error_message=str(exc),
                )

            return _build_response(
                config=config,
                status="unavailable",
                cache_status="miss",
                outdoor=None,
                fetched_at=entry["fetched_at"] if entry else None,
                expires_at=entry["expires_at"] if entry else None,
                error_code="weather_upstream_unavailable",
                error_message=str(exc),
            )

        fetched_at = datetime.now(timezone.utc)
        expires_at = fetched_at + timedelta(seconds=config.cache_ttl_seconds)
        _CACHE[cache_key] = {
            "outdoor": outdoor,
            "fetched_at": fetched_at,
            "expires_at": expires_at,
        }

        return _build_response(
            config=config,
            status="ok",
            cache_status="fresh",
            outdoor=outdoor,
            fetched_at=fetched_at,
            expires_at=expires_at,
        )


async def _fetch_open_meteo(config: WeatherConfig) -> OutdoorWeatherOut:
    params = {
        "latitude": config.latitude,
        "longitude": config.longitude,
        "timezone": config.timezone,
        "current": ",".join(
            [
                "temperature_2m",
                "apparent_temperature",
                "relative_humidity_2m",
                "is_day",
                "weather_code",
                "wind_speed_10m",
                "wind_direction_10m",
            ]
        ),
        "temperature_unit": "celsius",
        "wind_speed_unit": "kmh",
    }

    async with httpx.AsyncClient(timeout=config.http_timeout_seconds) as client:
        response = await client.get(_WEATHER_URL, params=params)
        response.raise_for_status()
        payload = response.json()

    current = payload.get("current") or {}
    observed_at = _parse_iso_datetime(current.get("time"))
    if observed_at is None:
        raise ValueError("Weather provider returned no observation time.")

    condition_code = int(current.get("weather_code", 0))
    is_day = bool(current.get("is_day", 1))
    condition, icon_code = _map_weather_code(condition_code, is_day)

    return OutdoorWeatherOut(
        observed_at=observed_at,
        temperature_c=float(current["temperature_2m"]),
        apparent_temperature_c=_optional_float(current.get("apparent_temperature")),
        humidity_pct=_optional_int(current.get("relative_humidity_2m")),
        condition=condition,
        condition_code=condition_code,
        icon_code=icon_code,
        is_day=is_day,
        wind_speed_kph=_optional_float(current.get("wind_speed_10m")),
        wind_direction_deg=_optional_int(current.get("wind_direction_10m")),
    )


def _build_response(
    *,
    config: WeatherConfig,
    status: str,
    cache_status: str,
    outdoor: Optional[OutdoorWeatherOut],
    fetched_at: Optional[datetime],
    expires_at: Optional[datetime],
    error_code: Optional[str] = None,
    error_message: Optional[str] = None,
) -> WeatherCurrentOut:
    return WeatherCurrentOut(
        status=status,
        location=_build_location(config) if config.latitude is not None and config.longitude is not None else None,
        outdoor=outdoor,
        indoor=None,
        cache=WeatherCacheMetaOut(
            status=cache_status,
            fetched_at=fetched_at,
            expires_at=expires_at,
            age_seconds=_calculate_age_seconds(fetched_at),
        ),
        error_code=error_code,
        error_message=error_message,
    )


def _build_location(config: WeatherConfig) -> WeatherLocationOut:
    return WeatherLocationOut(
        name=config.location_name,
        latitude=float(config.latitude),
        longitude=float(config.longitude),
        timezone=config.timezone,
    )


def _calculate_age_seconds(fetched_at: Optional[datetime]) -> Optional[int]:
    if fetched_at is None:
        return None
    now = datetime.now(timezone.utc)
    return max(0, int((now - fetched_at).total_seconds()))


def _build_cache_key(config: WeatherConfig) -> str:
    return f"{config.latitude}:{config.longitude}:{config.timezone}"


def _is_stale_usable(
    fetched_at: datetime, now: datetime, config: WeatherConfig
) -> bool:
    return (now - fetched_at).total_seconds() <= config.stale_if_error_seconds


def _parse_iso_datetime(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None

    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _optional_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    return float(value)


def _optional_int(value: Any) -> Optional[int]:
    if value is None:
        return None
    return int(value)


def _map_weather_code(code: int, is_day: bool) -> Tuple[str, str]:
    if code == 0:
        return ("Clear" if is_day else "Clear night", "clear-day" if is_day else "clear-night")
    if code in (1, 2):
        return (
            "Partly cloudy",
            "partly-cloudy-day" if is_day else "partly-cloudy-night",
        )
    if code == 3:
        return ("Cloudy", "cloudy")
    if code in (45, 48):
        return ("Fog", "fog")
    if code in (51, 53, 55, 56, 57, 61, 63, 65, 80, 81, 82):
        return ("Rain", "rain")
    if code in (66, 67):
        return ("Freezing rain", "rain")
    if code in (71, 73, 75, 77, 85, 86):
        return ("Snow", "snow")
    if code in (95, 96, 99):
        return ("Storm", "storm")
    return ("Conditions unavailable", "unknown")
