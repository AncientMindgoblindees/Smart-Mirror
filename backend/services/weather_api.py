"""
WeatherAPI.com client — https://www.weatherapi.com/docs/
Uses forecast.json (includes current + multi-day forecast) in one request.
"""

from __future__ import annotations

import asyncio
import time
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

import httpx

from backend.schemas.weather import WeatherForecastDayOut, WeatherSnapshotOut

WEATHERAPI_BASE = "https://api.weatherapi.com/v1"

_cache_lock = asyncio.Lock()
# key: "location_lower|metric|imperial" -> (snapshot, monotonic_ts)
_cache: dict[str, tuple[WeatherSnapshotOut, float]] = {}
CACHE_TTL_SEC = 300.0  # 5 minutes


def _map_condition_code(code: int, text: str) -> str:
    """
    Map WeatherAPI condition.code to mirror UI keys (WeatherIcons.tsx).
    See https://www.weatherapi.com/docs/weather_conditions.json
    """
    t = text.lower()
    if code == 1000:
        return "sunny"
    if code == 1003:
        return "partly-cloudy"
    if code in (1006, 1009):
        return "cloudy"
    if code in (1030, 1135, 1147):
        return "fog"
    if code in (1087, 1273, 1276, 1279, 1282):
        return "thunderstorm"
    if code in (
        1066,
        1114,
        1117,
        1210,
        1213,
        1216,
        1219,
        1222,
        1225,
        1237,
        1255,
        1258,
        1261,
        1264,
    ):
        return "snow"
    if code in (
        1063,
        1150,
        1153,
        1168,
        1171,
        1180,
        1183,
        1186,
        1189,
        1192,
        1195,
        1198,
        1201,
        1240,
        1243,
        1246,
        1249,
        1252,
    ):
        return "rain"
    if "snow" in t or "sleet" in t or "ice" in t:
        return "snow"
    if "thunder" in t:
        return "thunderstorm"
    if "rain" in t or "drizzle" in t or "shower" in t:
        return "rain"
    if "fog" in t or "mist" in t:
        return "fog"
    if "wind" in t or "blowing" in t:
        return "wind"
    return "partly-cloudy"


def _weekday_short(date_str: str) -> str:
    dt = datetime.strptime(date_str, "%Y-%m-%d")
    return dt.strftime("%a")


def _parse_forecast(
    payload: Dict[str, Any], imperial: bool
) -> tuple[WeatherSnapshotOut | None, str | None]:
    try:
        loc = payload["location"]
        cur = payload["current"]
        forecast = payload.get("forecast") or {}
        days: List[Dict[str, Any]] = forecast.get("forecastday") or []
    except (KeyError, TypeError) as e:
        return None, f"invalid_response: {e}"

    name = str(loc.get("name") or "").strip()
    region = str(loc.get("region") or "").strip()
    country = str(loc.get("country") or "").strip()
    if region and region.lower() != name.lower():
        location = f"{name}, {region}"
    elif country and country.lower() != name.lower():
        location = f"{name}, {country}"
    else:
        location = name or "—"

    if imperial:
        temp = float(cur.get("temp_f") or 0)
        feels = float(cur.get("feelslike_f") or 0)
        wind = float(cur.get("wind_mph") or 0)
    else:
        temp = float(cur.get("temp_c") or 0)
        feels = float(cur.get("feelslike_c") or 0)
        wind = float(cur.get("wind_kph") or 0)

    ccode = int(cur.get("condition", {}).get("code") or 1003)
    ctext = str(cur.get("condition", {}).get("text") or "")
    condition = _map_condition_code(ccode, ctext)

    forecast_out: List[WeatherForecastDayOut] = []
    for d in days[:7]:
        day = d.get("day") or {}
        date = str(d.get("date") or "")
        if imperial:
            hi = float(day.get("maxtemp_f") or 0)
            lo = float(day.get("mintemp_f") or 0)
        else:
            hi = float(day.get("maxtemp_c") or 0)
            lo = float(day.get("mintemp_c") or 0)
        dc = int((day.get("condition") or {}).get("code") or 1003)
        dt = str((day.get("condition") or {}).get("text") or "")
        forecast_out.append(
            WeatherForecastDayOut(
                weekday=_weekday_short(date) if date else "—",
                high=hi,
                low=lo,
                condition=_map_condition_code(dc, dt),
            )
        )

    # WeatherAPI may return fewer than 7 days on some plans.
    # Keep response shape stable for UI by padding to 7 entries.
    if len(forecast_out) < 7:
        seed = forecast_out[-1] if forecast_out else WeatherForecastDayOut(
            weekday=datetime.utcnow().strftime("%a"),
            high=temp,
            low=temp,
            condition=condition,
        )

        if days and isinstance(days[0], dict) and days[0].get("date"):
            try:
                base_date = datetime.strptime(str(days[0]["date"]), "%Y-%m-%d")
            except Exception:
                base_date = datetime.utcnow()
        else:
            base_date = datetime.utcnow()

        for idx in range(len(forecast_out), 7):
            dt = base_date + timedelta(days=idx)
            forecast_out.append(
                WeatherForecastDayOut(
                    weekday=dt.strftime("%a"),
                    high=seed.high,
                    low=seed.low,
                    condition=seed.condition,
                )
            )

    snap = WeatherSnapshotOut(
        configured=True,
        live=True,
        location=location,
        temperature_unit="fahrenheit" if imperial else "celsius",
        temp=temp,
        feels_like=feels,
        humidity_pct=int(cur.get("humidity") or 0),
        wind_speed=wind,
        wind_unit="mph" if imperial else "kmh",
        condition_text=ctext or "—",
        condition=condition,
        forecast=forecast_out,
    )
    return snap, None


async def fetch_weather_snapshot(
    api_key: str, q: str, imperial: bool
) -> tuple[Optional[WeatherSnapshotOut], Optional[str]]:
    params = {"key": api_key, "q": q, "days": 7}
    url = f"{WEATHERAPI_BASE}/forecast.json"
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get(url, params=params)
    except httpx.RequestError as e:
        return None, f"network: {e}"

    if r.status_code != 200:
        try:
            body = r.json()
            msg = body.get("error", {}).get("message") or r.text
        except Exception:
            msg = r.text
        return None, f"http_{r.status_code}: {msg}"

    try:
        data = r.json()
    except Exception as e:
        return None, f"json: {e}"

    snap, err = _parse_forecast(data, imperial)
    if err:
        return None, err
    return snap, None


def _cache_key(q: str, units: str) -> str:
    u = "imperial" if units.strip().lower() == "imperial" else "metric"
    return f"{q.strip().lower()}|{u}"


async def get_weather_snapshot(api_key: Optional[str], q: str, units: str) -> WeatherSnapshotOut:
    if not api_key or not api_key.strip():
        return WeatherSnapshotOut(
            configured=False,
            live=False,
            error="Set environment variable WEATHERAPI_KEY (see README).",
        )

    u = units.strip().lower()
    if u not in ("metric", "imperial"):
        u = "metric"
    imperial = u == "imperial"
    key = _cache_key(q, u)

    async with _cache_lock:
        now = time.monotonic()
        hit = _cache.get(key)
        if hit is not None and hit[0].live and (now - hit[1]) < CACHE_TTL_SEC:
            return hit[0]

    snap, err = await fetch_weather_snapshot(api_key.strip(), q.strip(), imperial)
    async with _cache_lock:
        if snap is not None:
            _cache[key] = (snap, time.monotonic())
            return snap

        return WeatherSnapshotOut(
            configured=True,
            live=False,
            location=q.strip(),
            temperature_unit="fahrenheit" if imperial else "celsius",
            error=err or "unknown",
        )
