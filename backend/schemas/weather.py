from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel


class WeatherLocationOut(BaseModel):
    name: str
    latitude: float
    longitude: float
    timezone: str


class OutdoorWeatherOut(BaseModel):
    observed_at: datetime
    temperature_c: float
    apparent_temperature_c: Optional[float] = None
    humidity_pct: Optional[int] = None
    condition: str
    condition_code: int
    icon_code: str
    is_day: bool
    wind_speed_kph: Optional[float] = None
    wind_direction_deg: Optional[int] = None
    source: str = "open-meteo"


class IndoorTemperatureOut(BaseModel):
    observed_at: datetime
    temperature_c: float
    source: str
    sensor_id: Optional[str] = None


class WeatherCacheMetaOut(BaseModel):
    status: Literal["fresh", "stale", "miss"]
    fetched_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    age_seconds: Optional[int] = None


class WeatherCurrentOut(BaseModel):
    status: Literal["ok", "stale", "unavailable"]
    location: Optional[WeatherLocationOut] = None
    outdoor: Optional[OutdoorWeatherOut] = None
    indoor: Optional[IndoorTemperatureOut] = None
    cache: WeatherCacheMetaOut
    error_code: Optional[str] = None
    error_message: Optional[str] = None
