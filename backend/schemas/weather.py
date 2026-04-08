from typing import List, Literal, Optional

from pydantic import BaseModel, Field


class WeatherForecastDayOut(BaseModel):
    weekday: str
    high: float
    low: float
    condition: str = Field(
        ...,
        description="UI icon key: sunny, partly-cloudy, cloudy, rain, thunderstorm, snow, fog, wind",
    )


class WeatherSnapshotOut(BaseModel):
    configured: bool = Field(
        ...,
        description="False when WEATHERAPI_KEY is not set",
    )
    live: bool = Field(
        False,
        description="True when data was fetched successfully from WeatherAPI.com",
    )
    location: str = ""
    temperature_unit: Literal["celsius", "fahrenheit"] = "celsius"
    temp: Optional[float] = None
    feels_like: Optional[float] = None
    humidity_pct: Optional[int] = None
    wind_speed: Optional[float] = None
    wind_unit: Literal["kmh", "mph"] = "kmh"
    condition_text: str = ""
    condition: str = "partly-cloudy"
    forecast: List[WeatherForecastDayOut] = Field(default_factory=list)
    error: Optional[str] = None
